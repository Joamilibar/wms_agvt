import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { PurchaseOrder, PurchaseOrderDocument, PO_OPEN_STATUSES, PoStatus } from '../schemas/purchase-order.schema.js';
import { SuppliersService } from '../masters/suppliers.service.js';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from '../dto/purchase-order.dto.js';

export interface InTransitLine {
  sku: string;
  qty: number;
  eta: Date | null;
  orderNumber: string;
  supplierName: string;
}

/**
 * The life of a purchase order: draft → approved (admin, D12) → sent →
 * partial/received. What is approved and not yet received is the only "in
 * transit" the engine sees. Receiving creates the lots, with the real date
 * and the landed cost, so the aging of an imported SKU starts when it arrives.
 */
@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    @InjectModel(PurchaseOrder.name) private model: Model<PurchaseOrderDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    private counters: CountersService,
    private suppliers: SuppliersService,
  ) {}

  findAll(status?: PoStatus): Promise<PurchaseOrderDocument[]> {
    return this.model.find(status ? { status } : {}).sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<PurchaseOrderDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Orden de compra no encontrada');
    return doc;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string | null, planningRunId: Types.ObjectId | null = null): Promise<PurchaseOrderDocument> {
    if (!dto.lines?.length) throw new BadRequestException('La orden necesita al menos una línea');
    const supplier = dto.supplierName ? await this.suppliers.ensure(dto.supplierName) : null;
    const year = new Date().getFullYear();
    const seq = await this.counters.next(`OC-${year}`);
    const number = `OC-${year}-${String(seq).padStart(3, '0')}`;

    // Same SKU twice in one order is the mistake the old sheet made; merge it here.
    const merged = new Map<string, CreatePurchaseOrderDto['lines'][number]>();
    for (const l of dto.lines) {
      const prev = merged.get(l.sku);
      if (prev) prev.qtyOrdered += l.qtyOrdered;
      else merged.set(l.sku, { ...l });
    }

    return this.model.create({
      number,
      supplierId: supplier?._id ?? null,
      supplierName: supplier?.name ?? dto.supplierName ?? '',
      status: dto.status ?? 'approved',
      currency: dto.currency ?? supplier?.currency ?? 'USD',
      fxRate: dto.fxRate ?? null,
      destinationWarehouse: dto.destinationWarehouse ?? 'Bodega Virtual Tienda',
      lines: [...merged.values()].map((l) => ({
        sku: l.sku, name: l.name ?? '', qtyOrdered: l.qtyOrdered, qtyReceived: 0,
        eta: l.eta ? new Date(l.eta) : null, unitCost: l.unitCost ?? null,
      })),
      source: dto.source ?? 'manual',
      planningRunId,
      createdBy: userId ? new Types.ObjectId(userId) : null,
      notes: dto.notes ?? '',
    });
  }

  /** Undelivered quantity of open orders, per SKU, with the ETA of each line. */
  async inTransit(): Promise<Map<string, InTransitLine[]>> {
    const open = await this.model.find({ status: { $in: PO_OPEN_STATUSES } }).exec();
    const map = new Map<string, InTransitLine[]>();
    for (const po of open) {
      for (const l of po.lines) {
        const pending = l.qtyOrdered - l.qtyReceived;
        if (pending <= 0) continue;
        const list = map.get(l.sku) ?? [];
        list.push({ sku: l.sku, qty: pending, eta: l.eta, orderNumber: po.number, supplierName: po.supplierName });
        map.set(l.sku, list);
      }
    }
    return map;
  }

  async setLineEta(id: string, sku: string, eta: Date | null): Promise<PurchaseOrderDocument> {
    const po = await this.findById(id);
    const line = po.lines.find((l) => l.sku === sku);
    if (!line) throw new NotFoundException(`La orden no tiene la línea ${sku}`);
    line.eta = eta;
    po.markModified('lines');
    return po.save();
  }

  async updateDraft(id: string, patch: { lines?: { sku: string; qtyOrdered: number; eta?: string | null; unitCost?: number | null }[]; fxRate?: number | null; notes?: string; destinationWarehouse?: string }): Promise<PurchaseOrderDocument> {
    const po = await this.findById(id);
    if (po.status !== 'draft') throw new BadRequestException('Solo se edita una orden en borrador');
    if (patch.lines) {
      for (const l of patch.lines) {
        const line = po.lines.find((x) => x.sku === l.sku);
        if (!line) continue;
        line.qtyOrdered = l.qtyOrdered;
        if (l.eta !== undefined) line.eta = l.eta ? new Date(l.eta) : null;
        if (l.unitCost !== undefined) line.unitCost = l.unitCost;
      }
      po.lines = po.lines.filter((l) => l.qtyOrdered > 0);
      po.markModified('lines');
    }
    if (patch.fxRate !== undefined) po.fxRate = patch.fxRate;
    if (patch.notes !== undefined) po.notes = patch.notes;
    if (patch.destinationWarehouse) po.destinationWarehouse = patch.destinationWarehouse;
    return po.save();
  }

  async approve(id: string, userId: string | null): Promise<PurchaseOrderDocument> {
    const po = await this.findById(id);
    if (po.status !== 'draft') throw new BadRequestException(`La orden está ${po.status}; solo se aprueba un borrador`);
    if (po.lines.length === 0) throw new BadRequestException('La orden no tiene líneas');
    po.status = 'approved';
    po.approvedBy = userId ? new Types.ObjectId(userId) : null;
    po.approvedAt = new Date();
    return po.save();
  }

  async markSent(id: string): Promise<PurchaseOrderDocument> {
    const po = await this.findById(id);
    if (po.status !== 'approved') throw new BadRequestException('Solo se envía una orden aprobada');
    po.status = 'sent';
    return po.save();
  }

  /**
   * Receives some or all lines and creates one lot per line received. The
   * lot carries the real arrival date, the supplier and the landed unit cost
   * in CLP (FOB × fx × factor). BSale remains the source of truth for the
   * quantity: the receipt must be registered there too or the next sync
   * reverses it — same warning StockService.create logs for manual entries.
   */
  async receive(id: string, dto: ReceivePurchaseOrderDto, userId: string | null): Promise<{ order: PurchaseOrderDocument; lots: string[] }> {
    const po = await this.findById(id);
    if (!['approved', 'sent', 'partial'].includes(po.status)) throw new BadRequestException(`La orden está ${po.status}; no se puede recibir`);
    const fx = po.currency === 'CLP' ? 1 : (dto.fxRate ?? po.fxRate);
    if (!fx) throw new BadRequestException(`Falta el tipo de cambio ${po.currency}/CLP para valorizar la recepción`);
    const supplier = po.supplierId ? await this.suppliers.findById(String(po.supplierId)) : null;
    const landed = supplier?.landedFactor ?? 1;
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    const stamp = receivedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const lots: string[] = [];

    for (const r of dto.lines) {
      const line = po.lines.find((l) => l.sku === r.sku);
      if (!line) throw new NotFoundException(`La orden no tiene la línea ${r.sku}`);
      const pending = line.qtyOrdered - line.qtyReceived;
      if (r.qty <= 0) continue;
      if (r.qty > pending) throw new BadRequestException(`${r.sku}: se reciben ${r.qty} pero faltan ${pending}`);

      let lotCode = `${po.number}-${stamp}`;
      let n = 2;
      while (await this.stockModel.exists({ lot: lotCode, warehouse: po.destinationWarehouse, isActive: true })) lotCode = `${po.number}-${stamp}-${n++}`;
      // Without a FOB on the line, the SKU's latest lot cost keeps the valuation from collapsing to zero.
      let unitCostClp = Math.round((line.unitCost ?? 0) * fx * landed);
      if (!unitCostClp) {
        const last = await this.stockModel.findOne({ sku: r.sku, unitCost: { $gt: 0 } }).sort({ entryDate: -1 }).exec();
        unitCostClp = last?.unitCost ?? 0;
        if (last) this.logger.warn(`${po.number} ${r.sku}: sin costo en la orden, lote valorizado con el último costo conocido (${unitCostClp})`);
      }
      await this.stockModel.create({
        sku: r.sku, name: line.name || r.sku, lot: lotCode, entryDate: receivedAt, qty: r.qty, initialQty: r.qty,
        unitCost: unitCostClp, warehouse: po.destinationWarehouse, supplier: po.supplierName || null, isActive: true,
        location: r.location ?? '', createdBy: userId ? new Types.ObjectId(userId) : null,
      });
      lots.push(lotCode);
      line.qtyReceived += r.qty;
    }
    if (lots.length === 0) throw new BadRequestException('Nada que recibir');

    po.fxRate = fx;
    const allDone = po.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
    po.status = allDone ? 'received' : 'partial';
    po.markModified('lines');
    await po.save();
    this.logger.warn(
      `Recepción ${po.number}: ${lots.length} lotes creados en ${po.destinationWarehouse} por ${userId ?? 'unknown'}. ` +
      `Registrar la recepción en BSale o el próximo sync la revertirá.`,
    );
    return { order: po, lots };
  }

  async cancel(id: string): Promise<PurchaseOrderDocument> {
    const po = await this.findById(id);
    if (po.status === 'received') throw new BadRequestException('Una orden recibida no se anula');
    po.status = 'cancelled';
    return po.save();
  }
}
