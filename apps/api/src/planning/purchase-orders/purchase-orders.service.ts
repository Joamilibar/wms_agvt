import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { PurchaseOrder, PurchaseOrderDocument, PO_OPEN_STATUSES, PoStatus } from '../schemas/purchase-order.schema.js';
import { SuppliersService } from '../masters/suppliers.service.js';
import { CreatePurchaseOrderDto } from '../dto/purchase-order.dto.js';

export interface InTransitLine {
  sku: string;
  qty: number;
  eta: Date | null;
  orderNumber: string;
  supplierName: string;
}

/**
 * Phase 0 scope: create and list orders, and answer "what is in transit for
 * this SKU and when". Approval, sending and receipt come with phase 1.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name) private model: Model<PurchaseOrderDocument>,
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

  async create(dto: CreatePurchaseOrderDto, userId: string | null): Promise<PurchaseOrderDocument> {
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

  async cancel(id: string): Promise<PurchaseOrderDocument> {
    const po = await this.findById(id);
    po.status = 'cancelled';
    return po.save();
  }
}
