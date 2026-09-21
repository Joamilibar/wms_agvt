import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema.js';
import { StockService } from '../stock/stock.service.js';
import { BsaleService } from '../bsale/bsale.service.js';
import { PickingLogService } from '../picking-log/picking-log.service.js';
import { CountersService } from '../common/counters/counters.service.js';
import { SalesRecord, SalesRecordDocument } from '../analytics/schemas/sales-record.schema.js';
import { GuidesService } from '../guides/guides.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GUIDE_SYNC_QUEUE } from '../guides/guide-sync.processor.js';
import { CacheService } from '../common/cache/cache.service.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(SalesRecord.name) private salesModel: Model<SalesRecordDocument>,
    private stockService: StockService,
    private bsaleService: BsaleService,
    private pickingLogService: PickingLogService,
    private counters: CountersService,
    private guidesService: GuidesService,
    @InjectQueue(GUIDE_SYNC_QUEUE) private guideQueue: Queue,
    private cache: CacheService,
  ) {}

  private async generateOrderId(): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.counters.next('ORD-' + year, () =>
      this.orderModel.countDocuments({ orderId: new RegExp('^ORD-' + year + '-') }).exec(),
    );
    return `ORD-${year}-${String(seq).padStart(3, '0')}`;
  }

  async create(data: {
    client: string;
    originType?: string;
    bsaleDocumentId?: string;
    bsaleDocumentNumber?: string;
    bsaleOfficeId?: number;
    type?: string;
    priority?: string;
    warehouse?: string;
    destinationType?: string;
    generateGuide?: boolean;
    bsaleClientId?: number;
    bsaleDestinationOfficeId?: number;
    items: { sku: string; name: string; requestedQty: number; unitPrice?: number }[];
    notes?: string;
    createdBy: string;
  }): Promise<OrderDocument> {
    const orderId = await this.generateOrderId();
    return this.orderModel.create({
      orderId,
      type: data.type || 'picking',
      status: 'pending',
      priority: data.priority || 'normal',
      client: data.client,
      destinationType: data.destinationType || 'client',
      generateGuide: data.generateGuide || false,
      bsaleClientId: data.bsaleClientId || null,
      bsaleDestinationOfficeId: data.bsaleDestinationOfficeId || null,
      originType: data.originType || 'manual',
      bsaleDocumentId: data.bsaleDocumentId || null,
      bsaleDocumentNumber: data.bsaleDocumentNumber || null,
      bsaleOfficeId: data.bsaleOfficeId || null,
      warehouse: data.warehouse || 'Central',
      items: data.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        requestedQty: i.requestedQty,
        pickedQty: 0,
        // Captured now, while the BSale document is in hand: fetching it again
        // during picking would put an external call inside the transaction.
        unitPrice: i.unitPrice && i.unitPrice > 0 ? i.unitPrice : 0,
        priceSource: i.unitPrice && i.unitPrice > 0 ? 'bsale_document' : 'unknown',
        lots: [],
        status: 'pending',
      })),
      notes: data.notes || '',
      createdBy: new Types.ObjectId(data.createdBy),
    });
  }

  async findAll(query: { status?: string; warehouse?: string; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.warehouse) filter.warehouse = query.warehouse;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async startOrder(id: string, userId: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (order.status !== 'pending') {
      throw new BadRequestException('Order can only be started from pending status');
    }

    // Reserve FIFO lots and build the picking sheet. A-05: reserveFIFO now
    // writes reservedQty on the lots, so two orders open at once can no longer
    // promise the same units.
    for (const item of order.items) {
      if (item.requestedQty <= 0) continue;
      const { reserved } = await this.stockService.reserveFIFO(item.sku, item.requestedQty, order.warehouse);
      const held = reserved.map((r) => ({
        lotId: new Types.ObjectId(r.lotId),
        lot: r.lot,
        entryDate: r.entryDate,
        qty: r.qty,
        location: '',
        rack: r.rack || '',
        col: r.col || '',
        row: r.row || '',
        pallet: r.pallet || '',
      }));
      item.lots = held;          // picking sheet shown to the operator
      item.reservedLots = held;  // ledger that must be given back
    }

    order.status = 'in_progress';
    order.startedAt = new Date();
    order.assignedTo = new Types.ObjectId(userId);
    return order.save();
  }

  async processFIFO(id: string, pickedItems: { sku: string; qty: number }[], userId: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (order.status !== 'in_progress') {
      throw new BadRequestException('Order must be in_progress to process FIFO');
    }

    const needsGuide =
      (order.originType === 'bsale_factura' || order.originType === 'bsale_boleta') &&
      !order.guideId;

    // Pre-flight only. A-01: this block used to *emit* the guide in BSale before
    // the inventory transaction. If the transaction then failed, a tax document
    // existed with nothing backing it; and because the returned id was never
    // written to order.guideId, the `!order.guideId` guard stayed true and every
    // retry emitted another one. Emission now happens after the stock is
    // committed, as a separate retryable step (see below).
    if (needsGuide && !this.bsaleService.isConfigured()) {
      throw new BadRequestException('BSale no esta configurado para emitir guias. Picking detenido.');
    }

    const session = await this.stockService.startSession();
    const logItems: any[] = [];
    let emittedGuideId: string | null = null;
    const guideLines: {
      sku: string;
      name: string;
      qty: number;
      unitCost: number;
      bsaleVariantId: string | null;
      lots: { lot: string; qty: number }[];
    }[] = [];

    try {
      await session.withTransaction(async () => {
        // withTransaction re-runs this callback on transient errors (write
        // conflicts, elections). Everything it touches must therefore be reset
        // or re-read here, never carried over from a previous attempt.
        //
        // A-06: the order used to be the document loaded *outside* the session,
        // so a retry ran `pickedQty += ...` on top of the previous attempt's
        // already-incremented value and recorded double what left the warehouse.
        const tx = await this.orderModel.findById(id).session(session).exec();
        if (!tx) throw new NotFoundException('Order not found');

        logItems.length = 0;
        guideLines.length = 0;
        const salesRows: Record<string, unknown>[] = [];
        const pickedAt = new Date();

        for (const input of pickedItems) {
          const item = tx.items.find((i) => i.sku === input.sku);
          if (!item) continue;
          if (input.qty <= 0) continue;

          // A-05: release what this order was holding before consuming it.
          // Re-read each attempt, so a rolled-back retry releases exactly once.
          const held = (item.reservedLots || []).map((l) => ({
            lotId: l.lotId.toString(),
            qty: l.qty,
          }));
          if (held.length > 0) {
            await this.stockService.releaseReservations(held, session);
            item.reservedLots = [];
          }

          // Process WMS internally
          const result = await this.stockService.processFIFO(item.sku, input.qty, tx.warehouse, session);

          // Safe now: `item` comes from a fresh read on every attempt.
          item.pickedQty += result.consumed.reduce((sum, c) => sum + c.qty, 0);

          if (item.pickedQty >= item.requestedQty) {
            item.status = 'completed';
          } else if (item.pickedQty > 0) {
            item.status = 'partial';
          } else {
            item.status = 'unavailable';
          }

          logItems.push(...result.consumed.map(c => ({
            sku: item.sku,
            name: item.name,
            qty: c.qty,
            lot: c.lot,
            location: `${c.rack || ''}-${c.col || ''}-${c.row || ''}`
          })));

          // A-02: carry the lot's real BSale variant id into the guide line.
          // It used to be derived from the digits in the SKU, so 'SKU-001'
          // became variant 1 - an arbitrary product in the BSale catalogue.
          if (needsGuide) {
            for (const c of result.consumed) {
              guideLines.push({
                sku: item.sku,
                name: item.name,
                qty: c.qty,
                unitCost: c.unitCost,
                bsaleVariantId: c.bsaleProductId,
                lots: [{ lot: c.lot, qty: c.qty }],
              });
            }
          }

          // A-08: the only writer of SalesRecord used to be the seed, so ABC,
          // coverage and the sales trend showed 90 days of synthetic data and
          // never saw a real movement. One row per consumed lot line, in the
          // same transaction as the stock decrement so the two cannot diverge.
          //
          // The price is the one captured from the BSale document when the order
          // was created, so the ABC weighs revenue. Manual orders have none, and
          // fall back to the lot's cost — `priceSource` records which, because a
          // cost-weighted ABC answers a different question than a revenue-
          // weighted one and the two must not be read as the same number.
          const hasSalePrice = (item.unitPrice ?? 0) > 0;

          // A store restock or an internal production move is not a sale: the
          // units leave this warehouse but nothing was sold. Keeping them out
          // of SalesRecord keeps ABC and coverage honest.
          // Orders from before the field existed have no destinationType: they were sales.
          if ((order.destinationType ?? 'client') === 'client') salesRows.push(...result.consumed.map(c => ({
            timestamp: pickedAt,
            sku: item.sku,
            warehouse: tx.warehouse,
            qty: c.qty,
            unitPrice: hasSalePrice ? item.unitPrice : c.unitCost,
            priceSource: hasSalePrice ? 'bsale_document' : 'lot_cost',
            orderId: tx._id,
            guideId: null,
          })));
        }

        const allCompleted = tx.items.every((i) => i.status === 'completed' || i.status === 'unavailable');

        tx.status = allCompleted ? 'completed' : 'in_progress';
        if (allCompleted) tx.completedAt = pickedAt;

        await tx.save({ session });

        if (salesRows.length > 0) {
          await this.salesModel.insertMany(salesRows, { session });
        }
      });

      // A-01: the guide is a local record first, created only once the stock is
      // committed, and linked to the order straight away so a repeated call can
      // never produce a second one. Pushing it to BSale is a separate step that
      // may be retried without touching inventory.
      if (needsGuide && guideLines.length > 0) {
        const guide = await this.guidesService.createFromOrder({
          orderId: order._id as Types.ObjectId,
          client: order.client,
          emittedBy: userId,
          items: guideLines,
          bsaleOfficeId: order.bsaleOfficeId,
          bsaleReferenceNumber: order.bsaleDocumentNumber,
          bsaleReferenceCodeSii: order.originType === 'bsale_factura' ? 33 : 39,
        });

        const guideObjectId = guide._id as Types.ObjectId;

        await this.orderModel.updateOne(
          { _id: order._id },
          { $set: { guideId: guideObjectId } },
        ).exec();

        // jobId doubles as the idempotency key: re-queuing the same guide is a
        // no-op while the job is still known to the queue.
        await this.guideQueue.add(
          'emit-guide',
          { guideId: guideObjectId.toString() },
          {
            // Sin ':' — BullMQ lo usa como separador de claves en Redis y
            // rechaza un jobId que lo contenga.
            jobId: 'emit-guide-' + guideObjectId.toString(),
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        );

        emittedGuideId = guide.guideId;
        this.logger.log(
          `Order ${order.orderId}: guide ${guide.guideId} created (bsaleStatus=pending) and queued for BSale`,
        );
      }

      // A picking moves stock and writes SalesRecords, so every cached
      // analytics answer is now wrong. Drop them rather than wait out the TTL.
      await this.cache.invalidate('analytics:');

      // Write Picking Log asynchronously
      if (logItems.length > 0) {
        await this.pickingLogService.create({
          userId: new Types.ObjectId(userId),
          orderId: order._id as Types.ObjectId,
          type: order.originType,
          bsaleDocumentId: order.bsaleDocumentId,
          bsaleDocumentNumber: order.bsaleDocumentNumber,
          client: order.client,
          items: logItems,
          notes: emittedGuideId
            ? 'Guia de despacho ' + emittedGuideId + ' creada y encolada para BSale.'
            : '',
        });
      }

    } finally {
      await session.endSession();
    }

    return this.findById(id);
  }

  async cancelOrder(id: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (['completed', 'cancelled'].includes(order.status)) {
      throw new BadRequestException('Cannot cancel a completed or already cancelled order');
    }

    // A-05: hand the promised units back. Before reservations were real there
    // was nothing to return, which is why this method used to do nothing here.
    const held = order.items.flatMap((i) =>
      (i.reservedLots || []).map((l) => ({ lotId: l.lotId.toString(), qty: l.qty })),
    );
    if (held.length > 0) {
      const released = await this.stockService.releaseReservations(held);
      this.logger.log(
        `Order ${order.orderId} cancelled: released ${released} reserved units ` +
        `across ${held.length} lot(s)`,
      );
      order.items.forEach((i) => {
        i.reservedLots = [];
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    return order.save();
  }

  async getTraceability(id: string) {
    const order = await this.findById(id);
    return order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      requestedQty: item.requestedQty,
      pickedQty: item.pickedQty,
      status: item.status,
      lots: item.lots,
    }));
  }
}
