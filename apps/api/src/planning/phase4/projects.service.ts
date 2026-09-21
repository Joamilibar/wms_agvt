import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { OrdersService } from '../../orders/orders.service.js';
import { Order, OrderDocument } from '../../orders/schemas/order.schema.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { ProjectDemand, ProjectDemandDocument } from '../schemas/phase4.schemas.js';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';

export interface ProjectInput {
  customer: string; rut?: string | null; requiredDate?: string | null; warehouse?: string;
  lines: { sku: string; qty: number }[]; notes?: string;
}

/**
 * Projects as a pipeline (phase 4). Confirming one creates a picking order
 * that reserves the units with the FIFO mechanism the WMS already has; the
 * engine reads `qty − reservedQty`, so a confirmed project lowers the
 * available stock the moment it is confirmed. A quote reserves nothing and
 * is only shown, with its coverage, so the buyer can decide to cover the
 * hotel line's MOQ with it.
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectModel(ProjectDemand.name) private model: Model<ProjectDemandDocument>,
    @InjectModel(PlanningItem.name) private itemModel: Model<PlanningItemDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private counters: CountersService,
    private orders: OrdersService,
    private purchaseOrders: PurchaseOrdersService,
  ) {}

  list(): Promise<ProjectDemandDocument[]> {
    return this.model.find().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<ProjectDemandDocument> {
    const p = await this.model.findById(id).exec();
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  async create(input: ProjectInput, userId: string | null): Promise<ProjectDemandDocument> {
    const lines = input.lines.filter((l) => l.qty > 0);
    if (lines.length === 0) throw new BadRequestException('El proyecto necesita al menos una línea');
    const names = new Map((await this.itemModel.find({ sku: { $in: lines.map((l) => l.sku) } }, { sku: 1, name: 1 }).exec()).map((i) => [i.sku, i.name]));
    const year = new Date().getFullYear();
    const seq = await this.counters.next(`PRY-${year}`);
    return this.model.create({
      number: `PRY-${year}-${String(seq).padStart(3, '0')}`,
      customer: input.customer, rut: input.rut ?? null, status: 'quote',
      requiredDate: input.requiredDate ? new Date(input.requiredDate) : null,
      warehouse: input.warehouse ?? 'Bodega Virtual Tienda',
      lines: lines.map((l) => ({ sku: l.sku, name: names.get(l.sku) ?? '', qty: l.qty })),
      createdBy: userId ? new Types.ObjectId(userId) : null, notes: input.notes ?? '',
    });
  }

  async update(id: string, input: Partial<ProjectInput>): Promise<ProjectDemandDocument> {
    const p = await this.findById(id);
    if (p.status !== 'quote') throw new BadRequestException('Solo se edita una cotización; un proyecto confirmado se anula y se vuelve a crear');
    if (input.customer !== undefined) p.customer = input.customer;
    if (input.rut !== undefined) p.rut = input.rut;
    if (input.requiredDate !== undefined) p.requiredDate = input.requiredDate ? new Date(input.requiredDate) : null;
    if (input.warehouse) p.warehouse = input.warehouse;
    if (input.notes !== undefined) p.notes = input.notes;
    if (input.lines) {
      const lines = input.lines.filter((l) => l.qty > 0);
      const names = new Map((await this.itemModel.find({ sku: { $in: lines.map((l) => l.sku) } }, { sku: 1, name: 1 }).exec()).map((i) => [i.sku, i.name]));
      p.lines = lines.map((l) => ({ sku: l.sku, name: names.get(l.sku) ?? '', qty: l.qty }));
      p.markModified('lines');
    }
    return p.save();
  }

  /** Confirmation reserves: a picking order at the project's warehouse, started so the FIFO holds the lots. */
  async confirm(id: string, userId: string): Promise<ProjectDemandDocument> {
    const p = await this.findById(id);
    if (p.status !== 'quote') throw new BadRequestException(`El proyecto está ${p.status}`);
    const order = await this.orders.create({
      client: p.customer, type: 'picking', destinationType: 'client', originType: 'manual', warehouse: p.warehouse, priority: 'high',
      items: p.lines.map((l) => ({ sku: l.sku, name: l.name || l.sku, requestedQty: l.qty })),
      notes: `${p.number} · proyecto${p.requiredDate ? ` para ${p.requiredDate.toISOString().slice(0, 10)}` : ''}`,
      createdBy: userId,
    });
    await this.orders.startOrder(String(order._id), userId);
    p.status = 'confirmed';
    p.orderId = order._id;
    p.orderNumber = order.orderId;
    await p.save();
    this.logger.log(`${p.number} confirmado: picking ${order.orderId} reserva ${p.lines.reduce((s, l) => s + l.qty, 0)} u.`);
    return p;
  }

  async deliver(id: string): Promise<ProjectDemandDocument> {
    const p = await this.findById(id);
    if (p.status !== 'confirmed') throw new BadRequestException(`El proyecto está ${p.status}`);
    const order = p.orderId ? await this.orderModel.findById(p.orderId).exec() : null;
    if (!order || order.status !== 'completed') throw new BadRequestException('El picking del proyecto no está completado');
    p.status = 'delivered';
    return p.save();
  }

  async cancel(id: string): Promise<ProjectDemandDocument> {
    const p = await this.findById(id);
    if (p.status === 'delivered') throw new BadRequestException('Un proyecto entregado no se anula');
    if (p.orderId) {
      const order = await this.orderModel.findById(p.orderId).exec();
      if (order && !['completed', 'cancelled'].includes(order.status)) await this.orders.cancelOrder(String(order._id));
    }
    p.status = 'cancelled';
    return p.save();
  }

  /** Coverage of each open project line: what is available now plus what is on order. */
  async coverage(): Promise<Record<string, { sku: string; qty: number; available: number; inTransit: number; covered: boolean }[]>> {
    const open = await this.model.find({ status: { $in: ['quote', 'confirmed'] } }).exec();
    const skus = [...new Set(open.flatMap((p) => p.lines.map((l) => l.sku)))];
    if (skus.length === 0) return {};
    const stock = await this.stockModel.aggregate<{ _id: string; available: number; reserved: number }>([
      { $match: { isActive: true, sku: { $in: skus } } },
      { $group: { _id: '$sku', available: { $sum: { $subtract: ['$qty', '$reservedQty'] } }, reserved: { $sum: '$reservedQty' } } },
    ]).exec();
    const avail = new Map(stock.map((s) => [s._id, s.available]));
    const transit = await this.purchaseOrders.inTransit();
    const orderIds = open.filter((p) => p.orderId).map((p) => p.orderId!);
    const orders = new Map((await this.orderModel.find({ _id: { $in: orderIds } }).exec()).map((o) => [String(o._id), o]));
    const out: Record<string, { sku: string; qty: number; available: number; inTransit: number; covered: boolean }[]> = {};
    for (const p of open) {
      const order = p.orderId ? orders.get(String(p.orderId)) : undefined;
      out[String(p._id)] = p.lines.map((l) => {
        const available = avail.get(l.sku) ?? 0;
        const inTransit = (transit.get(l.sku) ?? []).reduce((s, t) => s + t.qty, 0);
        // Confirmed: covered when the picking reserved the whole line. Quote: when stock plus transit would.
        const reserved = order?.items.find((i) => i.sku === l.sku)?.reservedLots?.reduce((s, r) => s + r.qty, 0) ?? 0;
        const covered = p.status === 'confirmed' ? reserved >= l.qty : available + inTransit >= l.qty;
        return { sku: l.sku, qty: l.qty, available, inTransit, covered };
      });
    }
    return out;
  }
}
