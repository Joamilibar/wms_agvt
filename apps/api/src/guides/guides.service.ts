import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Guide, GuideDocument } from './schemas/guide.schema.js';
import { CountersService } from '../common/counters/counters.service.js';
import { CreateGuideDto } from './dto/create-guide.dto.js';
import { BsaleService } from '../bsale/bsale.service.js';

@Injectable()
export class GuidesService {
  private readonly logger = new Logger(GuidesService.name);

  constructor(
    @InjectModel(Guide.name) private guideModel: Model<GuideDocument>,
    private counters: CountersService,
    private bsaleService: BsaleService,
  ) {}

  private async generateGuideId(): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.counters.next('GD-' + year, () =>
      this.guideModel.countDocuments({ guideId: new RegExp('^GD-' + year + '-') }).exec(),
    );
    return `GD-${year}-${String(seq).padStart(3, '0')}`;
  }

  async create(data: CreateGuideDto & { emittedBy: string }): Promise<GuideDocument> {
    const guideId = await this.generateGuideId();
    return this.guideModel.create({
      ...data,
      guideId,
      emittedBy: new Types.ObjectId(data.emittedBy),
    });
  }

  async findAll(query: { type?: string; status?: string; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.guideModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.guideModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<GuideDocument> {
    const guide = await this.guideModel.findById(id).exec();
    if (!guide) throw new NotFoundException('Guide not found');
    return guide;
  }

  async emit(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);
    if (guide.status !== 'draft') throw new BadRequestException('Only draft guides can be emitted');
    guide.status = 'emitted';
    guide.emittedAt = new Date();
    return guide.save();
  }

  async receive(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);
    if (!['emitted', 'in_transit'].includes(guide.status)) {
      throw new BadRequestException('Guide must be emitted or in transit to receive');
    }
    guide.status = 'received';
    guide.receivedAt = new Date();
    return guide.save();
  }

  async cancel(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);
    if (['received', 'cancelled'].includes(guide.status)) {
      throw new BadRequestException('Cannot cancel a received or already cancelled guide');
    }
    guide.status = 'cancelled';
    return guide.save();
  }

  async updateBsaleStatus(id: string, status: string, data?: Partial<Guide>): Promise<GuideDocument> {
    const guide = await this.findById(id);
    guide.bsaleStatus = status as Guide['bsaleStatus'];
    if (data) Object.assign(guide, data);
    return guide.save();
  }

  /**
   * Creates the dispatch guide for a completed picking.
   *
   * A-01: the guide used to be emitted straight into BSale *before* the
   * inventory transaction, and its id was never written back to the order, so a
   * failed transaction left a tax document with no backing and every retry
   * emitted another one. The guide is now a local record first, created after
   * the stock has been committed, and the BSale emission is a separate,
   * retryable step tracked by bsaleStatus.
   */
  async createFromOrder(data: {
    orderId: Types.ObjectId;
    client: string;
    emittedBy: string;
    items: {
      sku: string;
      name: string;
      qty: number;
      unitCost: number;
      bsaleVariantId: string | null;
      lots: { lot: string; qty: number }[];
    }[];
    bsaleOfficeId?: number | null;
    bsaleReferenceNumber?: string | null;
    bsaleReferenceCodeSii?: number | null;
  }): Promise<GuideDocument> {
    const guideId = await this.generateGuideId();

    return this.guideModel.create({
      guideId,
      type: 'external',
      client: data.client,
      items: data.items,
      status: 'emitted',
      emittedAt: new Date(),
      emittedBy: new Types.ObjectId(data.emittedBy),
      orderId: data.orderId,
      bsaleStatus: 'pending',
      bsaleOfficeId: data.bsaleOfficeId ?? null,
      bsaleReferenceNumber: data.bsaleReferenceNumber ?? null,
      bsaleReferenceCodeSii: data.bsaleReferenceCodeSii ?? null,
    });
  }

  /**
   * Pushes a guide to BSale and records the outcome on the guide itself.
   *
   * Idempotent by design: a guide already marked `synced` is returned untouched,
   * so a re-queued job, a manual retry and a duplicate request all converge on
   * one BSale document.
   */
  async emitToBsale(id: string): Promise<GuideDocument> {
    const guide = await this.findById(id);

    if (guide.bsaleStatus === 'synced') {
      this.logger.log(`Guide ${guide.guideId} already synced to BSale, skipping`);
      return guide;
    }
    if (guide.status === 'cancelled') {
      throw new BadRequestException('Cannot sync a cancelled guide to BSale');
    }
    if (!this.bsaleService.isConfigured()) {
      throw new ServiceUnavailableException('BSale no configurado');
    }

    // A-02: the variant id comes from the lot's bsaleProductId, captured when
    // the guide was built. Lines without a mapping abort the emission instead of
    // being silently filtered out of the document.
    const details: { variantId: number; quantity: number }[] = [];
    const unmapped: string[] = [];

    for (const item of guide.items) {
      const variantId = Number(item.bsaleVariantId);
      if (!item.bsaleVariantId || !Number.isFinite(variantId) || variantId <= 0) {
        unmapped.push(item.sku);
        continue;
      }
      details.push({ variantId, quantity: item.qty });
    }

    if (unmapped.length > 0) {
      const message =
        'Sin mapeo de variante BSale para: ' + unmapped.join(', ') +
        '. Sincroniza el catalogo BSale o corrige el bsaleProductId de los lotes.';
      guide.bsaleStatus = 'error';
      guide.bsaleError = message;
      await guide.save();
      throw new BadRequestException(message);
    }

    try {
      const emissionDate = Math.floor(Date.now() / 1000);
      const created: any = await this.bsaleService.generateGuide({
        documentTypeId: 7, // Guia de Despacho
        officeId: guide.bsaleOfficeId || 1,
        declareSii: 0,
        emissionDate,
        references: guide.bsaleReferenceNumber
          ? [
              {
                number: guide.bsaleReferenceNumber,
                referenceDate: emissionDate,
                reason: 'Picking WMS PRO ' + guide.guideId,
                codeSii: guide.bsaleReferenceCodeSii ?? 33,
              },
            ]
          : [],
        details,
      });

      guide.bsaleStatus = 'synced';
      guide.bsaleDocumentId = created?.id != null ? String(created.id) : null;
      guide.bsaleSyncedAt = new Date();
      guide.bsaleError = null;
      this.logger.log(`Guide ${guide.guideId} synced to BSale document ${guide.bsaleDocumentId}`);
      return guide.save();
    } catch (error: any) {
      // BSale responde { error, errorCode }, no { message }. Leer solo `message`
      // dejaba en bsaleError un 'Request failed with status code 400' inutil,
      // ocultando el motivo real que la propia API sí explica.
      const body = error?.response?.data;
      const detail = body?.error || body?.message;
      const code = body?.errorCode ? ' (' + body.errorCode + ')' : '';
      const status = error?.response?.status ? 'HTTP ' + error.response.status + ': ' : '';
      const message = detail
        ? status + (Array.isArray(detail) ? detail.join('. ') : detail) + code
        : error?.message || 'BSale error';
      guide.bsaleStatus = 'error';
      guide.bsaleError = message;
      await guide.save();
      this.logger.error(`Guide ${guide.guideId} failed to sync to BSale: ${message}`);
      throw error;
    }
  }
}
