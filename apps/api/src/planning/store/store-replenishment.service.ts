import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { OrdersService } from '../../orders/orders.service.js';
import { Order, OrderDocument } from '../../orders/schemas/order.schema.js';
import { IdealStock, IdealStockDocument } from '../schemas/ideal-stock.schema.js';
import { TransferOrder, TransferOrderDocument, TransferDirection } from '../schemas/transfer-order.schema.js';
import { SalesHistory, SalesHistoryDocument } from '../schemas/sales-history.schema.js';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { PlanningRun, PlanningRunDocument } from '../schemas/planning-run.schema.js';
import { Warehouse, WarehouseDocument } from '../schemas/warehouse.schema.js';
import { PlanningParamsService } from '../masters/planning-params.service.js';
import { evaluateStoreSku, deliveriesFor, StoreParams, StoreSkuResult } from '../engine/store-engine.js';
import { UpsertIdealDto } from '../dto/store.dto.js';

export interface StorePlan {
  store: string;
  source: string;
  asOf: Date;
  params: StoreParams;
  summary: Record<string, number> & { deliveries: number };
  rows: (StoreSkuResult & { name: string; category: string })[];
}

/**
 * Store replenishment (phase 2). The plan is computed live from the store's
 * own sales, the ideals and the stock on both sides; a transfer order
 * freezes what was decided and drives the WMS picking that reserves and
 * moves the stock. What is approved and not delivered is in transit.
 */
@Injectable()
export class StoreReplenishmentService {
  private readonly logger = new Logger(StoreReplenishmentService.name);

  constructor(
    @InjectModel(IdealStock.name) private idealModel: Model<IdealStockDocument>,
    @InjectModel(TransferOrder.name) private transferModel: Model<TransferOrderDocument>,
    @InjectModel(SalesHistory.name) private salesModel: Model<SalesHistoryDocument>,
    @InjectModel(PlanningItem.name) private itemModel: Model<PlanningItemDocument>,
    @InjectModel(PlanningRun.name) private runModel: Model<PlanningRunDocument>,
    @InjectModel(Warehouse.name) private warehouseModel: Model<WarehouseDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private counters: CountersService,
    private params: PlanningParamsService,
    private orders: OrdersService,
  ) {}

  // ── stores and sources ─────────────────────────────────────────────────────

  async stores(): Promise<{ store: string; source: string }[]> {
    const [stores, sources] = await Promise.all([
      this.warehouseModel.find({ role: 'store', isActive: true }).sort({ name: 1 }).exec(),
      this.warehouseModel.find({ role: 'sellable', isActive: true, countsFor: 'store' }).sort({ name: 1 }).exec(),
    ]);
    const source = sources[0]?.name ?? 'Bodega Virtual Tienda';
    return stores.map((s) => ({ store: s.name, source }));
  }

  // ── plan ───────────────────────────────────────────────────────────────────

  async plan(store: string): Promise<StorePlan> {
    const stores = await this.stores();
    const cfg = stores.find((s) => s.store === store);
    if (!cfg) throw new NotFoundException(`${store} no es una tienda activa`);
    const p = await this.params.current();
    const params: StoreParams = {
      cycleDays: p.storeCycleDays, deliveryDays: p.storeDeliveryDays, displayMin: p.storeDisplayMin,
      demandWindowDays: p.storeDemandWindowDays, splitDeliveryUnits: p.storeSplitDeliveryUnits,
      withdrawAfterMonths: p.phaseOutMonths, zByClass: p.zByClass,
    };
    const asOf = new Date();
    const windowStart = new Date(asOf.getTime() - params.demandWindowDays * 86400000);
    const recentStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - params.withdrawAfterMonths, 1));

    const [sales, recent, stockStore, stockSource, ideals, items, latestRun, transit] = await Promise.all([
      this.salesModel.aggregate<{ _id: { sku: string; date: string }; qty: number }>([
        { $match: { warehouse: store, channel: 'retail', isService: false, date: { $gte: windowStart } } },
        { $group: { _id: { sku: '$sku', date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } }, qty: { $sum: '$qty' } } },
      ]).exec(),
      this.salesModel.aggregate<{ _id: string; qty: number }>([
        { $match: { warehouse: store, channel: 'retail', isService: false, date: { $gte: recentStart } } },
        { $group: { _id: '$sku', qty: { $sum: '$qty' } } },
      ]).exec(),
      this.stockBySku(store),
      this.stockBySku(cfg.source),
      this.idealModel.find({ store }).exec(),
      this.itemModel.find({}, { sku: 1, name: 1, category: 1, origin: 1, lifecycle: 1 }).exec(),
      this.runModel.findOne({ status: 'approved' }, { 'results.sku': 1, 'results.abc': 1 }).sort({ createdAt: -1 }).exec(),
      this.inTransitTo(store),
    ]);
    // ABC comes from the approved run, or the latest one if none is approved yet.
    const abcRun = latestRun ?? (await this.runModel.findOne({}, { 'results.sku': 1, 'results.abc': 1 }).sort({ createdAt: -1 }).exec());

    const salesBySku = new Map<string, { date: string; qty: number }[]>();
    for (const s of sales) {
      const list = salesBySku.get(s._id.sku) ?? [];
      list.push({ date: s._id.date, qty: s.qty });
      salesBySku.set(s._id.sku, list);
    }
    const recentBySku = new Map(recent.map((r) => [r._id, r.qty]));
    const abcBySku = new Map((abcRun?.results ?? []).map((r) => [r.sku, r.abc]));
    const idealBySku = new Map(ideals.filter((i) => this.isValid(i, asOf)).map((i) => [i.sku, i]));
    const nameBySku = new Map(items.map((i) => [i.sku, { name: i.name, category: i.category, origin: i.origin, lifecycle: i.lifecycle }]));

    // Every SKU that matters to the store: sold there, has an ideal, or sits on its shelves.
    const skus = new Set<string>([...salesBySku.keys(), ...idealBySku.keys(), ...stockStore.keys()]);
    const rows: StorePlan['rows'] = [];
    for (const sku of skus) {
      const meta = nameBySku.get(sku);
      if (meta && (meta.origin === 'service' || meta.origin === 'pack' || meta.lifecycle === 'discontinued')) continue;
      const ideal = idealBySku.get(sku);
      const r = evaluateStoreSku({
        sku, abc: abcBySku.get(sku) ?? 'C',
        dailySales: salesBySku.get(sku) ?? [],
        soldRecently: recentBySku.get(sku) ?? 0,
        manualIdeal: ideal ? { ideal: ideal.ideal, displayMin: ideal.displayMin } : null,
        stockStore: stockStore.get(sku) ?? 0,
        inTransitToStore: transit.get(sku) ?? 0,
        availableSource: stockSource.get(sku) ?? 0,
      }, params);
      rows.push({ ...r, name: meta?.name ?? '', category: meta?.category ?? '' });
    }
    const order = { ENVIAR: 0, FALTANTE_SIN_RESPALDO: 1, RETIRO: 2, SOBRE_STOCK: 3, OK: 4, SIN_IDEAL: 5 } as const;
    rows.sort((a, b) => order[a.state] - order[b.state] || (a.abc < b.abc ? -1 : a.abc > b.abc ? 1 : 0) || b.send - a.send);

    const summary: StorePlan['summary'] = { skus: rows.length, deliveries: 1 };
    for (const r of rows) summary[r.state] = (summary[r.state] ?? 0) + 1;
    summary.sendUnits = rows.reduce((s, r) => s + r.send, 0);
    summary.withdrawUnits = rows.reduce((s, r) => s + r.withdraw, 0);
    summary.uncoveredUnits = rows.reduce((s, r) => s + Math.max(0, r.need - r.send), 0);
    summary.manualIdeals = rows.filter((r) => r.idealSource === 'manual').length;
    summary.computedIdeals = rows.filter((r) => r.idealSource === 'computed').length;
    summary.deliveries = deliveriesFor(summary.sendUnits, params);
    return { store, source: cfg.source, asOf, params, summary, rows };
  }

  // ── ideals ─────────────────────────────────────────────────────────────────

  listIdeals(store: string): Promise<IdealStockDocument[]> {
    return this.idealModel.find({ store }).sort({ sku: 1 }).exec();
  }

  async upsertIdeals(store: string, rows: UpsertIdealDto[], setBy: string): Promise<{ created: number; updated: number; removed: number }> {
    let created = 0, updated = 0, removed = 0;
    for (const r of rows) {
      const existing = await this.idealModel.findOne({ sku: r.sku, store }).exec();
      if (r.ideal === null || r.ideal === undefined) {
        if (existing) { await existing.deleteOne(); removed++; }
        continue;
      }
      const patch = {
        ideal: r.ideal, displayMin: r.displayMin ?? existing?.displayMin ?? 0,
        validFrom: r.validFrom ? new Date(r.validFrom) : existing?.validFrom ?? null,
        validTo: r.validTo ? new Date(r.validTo) : r.validTo === null ? null : existing?.validTo ?? null,
        setBy, notes: r.notes ?? existing?.notes ?? '',
      };
      if (existing) { Object.assign(existing, patch); await existing.save(); updated++; }
      else { await this.idealModel.create({ sku: r.sku, store, ...patch }); created++; }
    }
    return { created, updated, removed };
  }

  // ── transfers ──────────────────────────────────────────────────────────────

  listTransfers(store?: string): Promise<TransferOrderDocument[]> {
    return this.transferModel.find(store ? { $or: [{ toWarehouse: store }, { fromWarehouse: store }] } : {}).sort({ createdAt: -1 }).exec();
  }

  async findTransfer(id: string): Promise<TransferOrderDocument> {
    const t = await this.transferModel.findById(id).exec();
    if (!t) throw new NotFoundException('Transferencia no encontrada');
    return t;
  }

  /** Freezes the plan's shipment (or withdrawal) into a draft transfer, with the planner's changes. */
  async createFromPlan(
    store: string, direction: TransferDirection,
    overrides: { sku: string; qty: number; reason?: string }[], userId: string | null,
  ): Promise<TransferOrderDocument> {
    const plan = await this.plan(store);
    const overrideMap = new Map(overrides.map((o) => [o.sku, o]));
    const lines = plan.rows
      .map((r) => {
        const suggested = direction === 'send' ? r.send : r.withdraw;
        const o = overrideMap.get(r.sku);
        const qty = o ? o.qty : suggested;
        return {
          sku: r.sku, name: r.name, qtySuggested: suggested, qtyApproved: qty, qtyDelivered: 0,
          snapshot: { ideal: r.ideal, stockStore: r.stockStore, inTransit: r.inTransit, availableSource: r.availableSource, idealSource: r.idealSource },
          reason: o?.reason ?? '',
        };
      })
      .filter((l) => l.qtyApproved > 0);
    if (lines.length === 0) throw new BadRequestException('Nada que transferir');

    const year = new Date().getFullYear();
    const seq = await this.counters.next(`TR-${year}`);
    return this.transferModel.create({
      number: `TR-${year}-${String(seq).padStart(3, '0')}`,
      direction,
      fromWarehouse: direction === 'send' ? plan.source : store,
      toWarehouse: direction === 'send' ? store : plan.source,
      status: 'draft', lines, createdBy: userId ? new Types.ObjectId(userId) : null,
      notes: `Plan del ${plan.asOf.toISOString().slice(0, 10)}; ${plan.summary.deliveries} entrega(s) esta semana.`,
    });
  }

  async updateDraft(id: string, lines: { sku: string; qtyApproved: number; reason?: string }[]): Promise<TransferOrderDocument> {
    const t = await this.findTransfer(id);
    if (t.status !== 'draft') throw new BadRequestException('Solo se edita una transferencia en borrador');
    for (const l of lines) {
      const line = t.lines.find((x) => x.sku === l.sku);
      if (!line) continue;
      line.qtyApproved = l.qtyApproved;
      if (l.reason !== undefined) line.reason = l.reason;
    }
    t.lines = t.lines.filter((l) => l.qtyApproved > 0);
    t.markModified('lines');
    return t.save();
  }

  /**
   * Approval (supervisor, D12) creates the picking order at the origin: the
   * existing FIFO reservation holds the units until they are picked.
   */
  async approve(id: string, userId: string): Promise<TransferOrderDocument> {
    const t = await this.findTransfer(id);
    if (t.status !== 'draft') throw new BadRequestException(`La transferencia está ${t.status}`);
    const order = await this.orders.create({
      client: t.direction === 'send' ? `Reposición ${t.toWarehouse}` : `Retiro desde ${t.fromWarehouse}`,
      type: 'replenishment', destinationType: 'store_restock', originType: 'manual',
      warehouse: t.fromWarehouse, priority: 'normal',
      items: t.lines.map((l) => ({ sku: l.sku, name: l.name || l.sku, requestedQty: l.qtyApproved })),
      notes: `${t.number} · ${t.direction === 'send' ? 'envío a' : 'retiro hacia'} ${t.toWarehouse}`,
      createdBy: userId,
    });
    await this.orders.startOrder(String(order._id), userId);
    t.status = 'approved';
    t.pickingOrderId = order._id as Types.ObjectId;
    t.pickingOrderNumber = order.orderId;
    t.approvedBy = new Types.ObjectId(userId);
    t.approvedAt = new Date();
    await t.save();
    this.logger.log(`${t.number} aprobada: picking ${order.orderId} en ${t.fromWarehouse}`);
    return t;
  }

  /**
   * Delivery creates the lots at the destination with the quantities the
   * picking actually took, valued at the average cost of the lots consumed.
   * BSale must see the transfer too: the sync owns the quantities.
   */
  async deliver(id: string, userId: string | null): Promise<{ transfer: TransferOrderDocument; lots: string[] }> {
    const t = await this.findTransfer(id);
    if (!['approved', 'picking'].includes(t.status)) throw new BadRequestException(`La transferencia está ${t.status}`);
    const order = t.pickingOrderId ? await this.orderModel.findById(t.pickingOrderId).exec() : null;
    if (!order || order.status !== 'completed') throw new BadRequestException('El picking de origen no está completado todavía');

    const receivedAt = new Date();
    const stamp = receivedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const lots: string[] = [];
    for (const line of t.lines) {
      const item = order.items.find((i) => i.sku === line.sku);
      const picked = item?.pickedQty ?? 0;
      if (picked <= 0) continue;
      // Weighted cost of the origin lots the picking consumed; the SKU's latest cost if none is known.
      const consumed = (item?.lots ?? []) as { lotId: Types.ObjectId; qty: number }[];
      const originLots = consumed.length ? await this.stockModel.find({ _id: { $in: consumed.map((l) => l.lotId) } }, { unitCost: 1 }).exec() : [];
      const costById = new Map(originLots.map((l) => [String(l._id), l.unitCost]));
      const weighted = consumed.reduce((s, l) => s + (costById.get(String(l.lotId)) ?? 0) * l.qty, 0);
      const units = consumed.reduce((s, l) => s + l.qty, 0);
      const cost = units > 0 && weighted > 0
        ? Math.round(weighted / units)
        : (await this.stockModel.findOne({ sku: line.sku, unitCost: { $gt: 0 } }).sort({ entryDate: -1 }).exec())?.unitCost ?? 0;
      let lotCode = `${t.number}-${stamp}`;
      let n = 2;
      while (await this.stockModel.exists({ lot: lotCode, warehouse: t.toWarehouse, isActive: true })) lotCode = `${t.number}-${stamp}-${n++}`;
      await this.stockModel.create({
        sku: line.sku, name: line.name || line.sku, lot: lotCode, entryDate: receivedAt, qty: picked, initialQty: picked,
        unitCost: cost, warehouse: t.toWarehouse, supplier: null, isActive: true, location: '',
        createdBy: userId ? new Types.ObjectId(userId) : null,
      });
      line.qtyDelivered = picked;
      lots.push(lotCode);
    }
    t.status = 'delivered';
    t.deliveredAt = receivedAt;
    t.markModified('lines');
    await t.save();
    this.logger.warn(`${t.number} entregada: ${lots.length} lotes en ${t.toWarehouse}. Registrar el traslado en BSale o el próximo sync lo revertirá.`);
    return { transfer: t, lots };
  }

  async cancel(id: string): Promise<TransferOrderDocument> {
    const t = await this.findTransfer(id);
    if (t.status === 'delivered') throw new BadRequestException('Una transferencia entregada no se anula');
    if (t.pickingOrderId) {
      const order = await this.orderModel.findById(t.pickingOrderId).exec();
      if (order && order.status !== 'completed' && order.status !== 'cancelled') await this.orders.cancelOrder(String(order._id));
    }
    t.status = 'cancelled';
    return t.save();
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async stockBySku(warehouse: string): Promise<Map<string, number>> {
    const rows = await this.stockModel.aggregate<{ _id: string; available: number }>([
      { $match: { isActive: true, warehouse } },
      { $group: { _id: '$sku', available: { $sum: { $subtract: ['$qty', '$reservedQty'] } } } },
    ]).exec();
    return new Map(rows.map((r) => [r._id, r.available]));
  }

  /** Approved shipments not yet delivered, per SKU. */
  private async inTransitTo(store: string): Promise<Map<string, number>> {
    const open = await this.transferModel.find({ toWarehouse: store, direction: 'send', status: { $in: ['approved', 'picking'] } }).exec();
    const map = new Map<string, number>();
    for (const t of open) for (const l of t.lines) map.set(l.sku, (map.get(l.sku) ?? 0) + l.qtyApproved);
    return map;
  }

  private isValid(i: IdealStock, asOf: Date): boolean {
    return (!i.validFrom || i.validFrom <= asOf) && (!i.validTo || i.validTo >= asOf);
  }
}
