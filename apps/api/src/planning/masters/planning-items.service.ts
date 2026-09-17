import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { Supplier, SupplierDocument } from '../schemas/supplier.schema.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { SalesHistory, SalesHistoryDocument } from '../schemas/sales-history.schema.js';
import { SuppliersService } from './suppliers.service.js';
import { escapeRegex } from '../../common/utils/regex.js';
import {
  UpsertPlanningItemDto,
  UpdatePlanningItemDto,
  QueryPlanningItemsDto,
} from '../dto/planning-item.dto.js';

/** A planning item with the supplier's defaults filled into the null fields. */
export interface ResolvedSupply {
  sku: string;
  supplierName: string | null;
  leadTimeDays: number | null;
  transitDays: number | null;
  cadenceDays: number | null;
  moq: number | null;
  orderMultiple: number;
  /** Which of the three came from the supplier rather than the item. */
  inherited: ('leadTimeDays' | 'transitDays')[];
  missing: ('supplier' | 'leadTime')[];
}

@Injectable()
export class PlanningItemsService {
  private readonly logger = new Logger(PlanningItemsService.name);

  constructor(
    @InjectModel(PlanningItem.name) private model: Model<PlanningItemDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectModel(SalesHistory.name) private salesModel: Model<SalesHistoryDocument>,
    private suppliersService: SuppliersService,
  ) {}

  async findAll(query: QueryPlanningItemsDto): Promise<PlanningItemDocument[]> {
    const filter: Record<string, unknown> = {};
    if (query.origin) filter.origin = query.origin;
    if (query.lifecycle) filter.lifecycle = query.lifecycle;
    if (query.search) {
      const re = { $regex: escapeRegex(query.search), $options: 'i' };
      filter.$or = [{ sku: re }, { name: re }, { category: re }];
    }
    if (query.missingSupply === 'true') {
      // Without a supplier there is nothing to inherit the lead time from.
      filter.origin = 'imported';
      filter.supplierId = null;
    }
    return this.model.find(filter).populate('supplierId').sort({ category: 1, name: 1 }).exec();
  }

  async findBySku(sku: string): Promise<PlanningItemDocument> {
    const doc = await this.model.findOne({ sku }).populate('supplierId').exec();
    if (!doc) throw new NotFoundException(`No hay ficha de abastecimiento para ${sku}`);
    return doc;
  }

  async update(sku: string, dto: UpdatePlanningItemDto): Promise<PlanningItemDocument> {
    const doc = await this.model.findOne({ sku }).exec();
    if (!doc) throw new NotFoundException(`No hay ficha de abastecimiento para ${sku}`);
    Object.assign(doc, await this.normalize(dto));
    await doc.save();
    return this.findBySku(sku);
  }

  /**
   * Creates or updates items in bulk. Fields absent from a row are left as
   * they are, so a partial file (say, only lead times) does not blank the rest.
   */
  async upsertMany(items: UpsertPlanningItemDto[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const dto of items) {
      const patch = await this.normalize(dto);
      const existing = await this.model.findOne({ sku: dto.sku }).exec();
      if (existing) {
        Object.assign(existing, patch);
        await existing.save();
        updated++;
      } else {
        await this.model.create({ sku: dto.sku, isHotelLine: dto.sku.startsWith('H'), ...patch });
        created++;
      }
    }
    this.logger.log(`Planning items upsert: ${created} created, ${updated} updated`);
    return { created, updated };
  }

  /**
   * Makes sure every SKU the WMS knows — active lots and sold lines — has a
   * planning item. New ones come in as `unknown` origin, which is the second
   * alert the screen shows after "imported without supplier".
   */
  async syncFromCatalog(): Promise<{ created: number; total: number }> {
    const [lotSkus, soldSkus, lotNames] = await Promise.all([
      this.stockModel.distinct('sku', { isActive: true }).exec(),
      this.salesModel.distinct('sku', { isService: false }).exec(),
      this.stockModel.aggregate<{ _id: string; name: string }>([
        { $match: { isActive: true } },
        { $group: { _id: '$sku', name: { $first: '$name' } } },
      ]).exec(),
    ]);
    const names = new Map(lotNames.map((n) => [n._id, n.name]));
    const soldNames = await this.salesModel.aggregate<{ _id: string; name: string }>([
      { $match: { isService: false } },
      { $group: { _id: '$sku', name: { $first: '$productName' } } },
    ]).exec();
    for (const n of soldNames) if (!names.has(n._id)) names.set(n._id, n.name);

    const all = new Set<string>([...lotSkus, ...soldSkus]);
    const existing = new Set(await this.model.distinct('sku').exec());
    let created = 0;
    for (const sku of all) {
      if (existing.has(sku)) continue;
      await this.model.create({
        sku,
        name: names.get(sku) ?? '',
        origin: 'unknown',
        isHotelLine: sku.startsWith('H'),
      });
      created++;
    }
    return { created, total: all.size };
  }

  /** Supply terms of a SKU with supplier defaults applied. Used by the engine and the alerts. */
  async resolveSupply(sku: string): Promise<ResolvedSupply> {
    const item = await this.model.findOne({ sku }).exec();
    if (!item) throw new NotFoundException(`No hay ficha de abastecimiento para ${sku}`);
    const supplier = item.supplierId ? await this.supplierModel.findById(item.supplierId).exec() : null;
    return this.resolve(item, supplier);
  }

  resolve(item: PlanningItem, supplier: Supplier | null): ResolvedSupply {
    const inherited: ResolvedSupply['inherited'] = [];
    const missing: ResolvedSupply['missing'] = [];
    let leadTimeDays = item.leadTimeDays;
    let transitDays = item.transitDays;
    if (leadTimeDays == null && supplier) { leadTimeDays = supplier.leadTimeDays; inherited.push('leadTimeDays'); }
    if (transitDays == null && supplier) { transitDays = supplier.transitDays; inherited.push('transitDays'); }
    if (item.origin === 'imported' && !supplier) missing.push('supplier');
    if (item.origin === 'imported' && leadTimeDays == null) missing.push('leadTime');
    return {
      sku: item.sku,
      supplierName: supplier?.name ?? null,
      leadTimeDays,
      transitDays,
      cadenceDays: supplier?.cadenceDays ?? null,
      moq: item.moq,
      orderMultiple: item.orderMultiple,
      inherited,
      missing,
    };
  }

  /** Counts for the alert badges. */
  async alerts(): Promise<{ importedWithoutSupplier: number; unknownOrigin: number; total: number }> {
    const [importedWithoutSupplier, unknownOrigin, total] = await Promise.all([
      this.model.countDocuments({ origin: 'imported', supplierId: null }).exec(),
      this.model.countDocuments({ origin: 'unknown' }).exec(),
      this.model.countDocuments().exec(),
    ]);
    return { importedWithoutSupplier, unknownOrigin, total };
  }

  private async normalize(dto: UpdatePlanningItemDto): Promise<Record<string, unknown>> {
    const { supplierName, supplierId, launchDate, sku: _sku, ...rest } = dto;
    const patch: Record<string, unknown> = { ...rest };
    if (supplierName !== undefined) {
      patch.supplierId = supplierName ? (await this.suppliersService.ensure(supplierName))._id : null;
    } else if (supplierId !== undefined) {
      patch.supplierId = supplierId ? new Types.ObjectId(supplierId) : null;
    }
    if (launchDate !== undefined) patch.launchDate = launchDate ? new Date(launchDate) : null;
    return patch;
  }
}
