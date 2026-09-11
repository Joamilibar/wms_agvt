import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, ClientSession } from 'mongoose';
import { StockLot, StockLotDocument } from './schemas/stock-lot.schema.js';
import { CreateStockLotDto } from './dto/create-stock-lot.dto.js';
import { QueryStockDto } from './dto/query-stock.dto.js';

export interface LotConsumption {
  lotId: string;
  lot: string;
  entryDate: Date;
  qty: number;
  unitCost: number;
  bsaleProductId: string | null;
  rack?: string;
  col?: string;
  row?: string;
  pallet?: string;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectModel(StockLot.name) private stockLotModel: Model<StockLotDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(dto: CreateStockLotDto, userId?: string): Promise<StockLotDocument> {
    // BSale is the source of truth for quantity, so a lot entered here that BSale
    // does not know about will be drawn back down by the next sync. Legitimate for
    // a receipt the WMS sees first, a drift source otherwise — worth a trace.
    this.logger.warn(
      `Manual stock entry: ${dto.qty} units of ${dto.sku} in ${dto.warehouse ?? 'Central'} ` +
      `by user ${userId ?? 'unknown'}. Register it in BSale or the next sync will reverse it.`,
    );

    return this.stockLotModel.create({
      ...dto,
      initialQty: dto.qty,
      isActive: true,
      createdBy: userId || null,
    });
  }

  async findAll(query: QueryStockDto) {
    const filter: Record<string, unknown> = { isActive: true };
    if (query.sku) filter.sku = { $regex: query.sku, $options: 'i' };
    if (query.warehouse) filter.warehouse = query.warehouse;
    if (query.lot) filter.lot = { $regex: query.lot, $options: 'i' };

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.stockLotModel.find(filter).sort({ entryDate: 1 }).skip(skip).limit(limit).exec(),
      this.stockLotModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findFifoBySku(sku: string, warehouse?: string): Promise<StockLotDocument[]> {
    // Available, not physical: a lot fully promised to an open order is not
    // something a second order may be shown as free stock.
    const filter: Record<string, unknown> = {
      sku,
      isActive: true,
      $expr: { $gt: [{ $subtract: ['$qty', '$reservedQty'] }, 0] },
    };
    if (warehouse) filter.warehouse = warehouse;
    return this.stockLotModel.find(filter).sort({ entryDate: 1 }).exec();
  }

  async getSummary(warehouse?: string) {
    const match: Record<string, unknown> = { isActive: true };
    if (warehouse) match.warehouse = warehouse;

    return this.stockLotModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$sku',
          name: { $first: '$name' },
          totalQty: { $sum: '$qty' },
          totalValue: { $sum: { $multiply: ['$qty', '$unitCost'] } },
          lotCount: { $sum: 1 },
          avgCost: { $avg: '$unitCost' },
          oldestEntry: { $min: '$entryDate' },
          newestEntry: { $max: '$entryDate' },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();
  }

  async getWarehouses(): Promise<string[]> {
    return this.stockLotModel.distinct('warehouse').exec();
  }

  async adjustQty(id: string, qty: number): Promise<StockLotDocument> {
    const lot = await this.stockLotModel.findById(id).exec();
    if (!lot) throw new NotFoundException('Lot not found');

    lot.qty = qty;
    if (qty <= 0) lot.isActive = false;
    return lot.save();
  }

  async deactivate(id: string): Promise<StockLotDocument> {
    const lot = await this.stockLotModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    ).exec();
    if (!lot) throw new NotFoundException('Lot not found');
    return lot;
  }

  /**
   * FIFO Engine — Core business logic
   * Consumes stock lots in entry-date order (oldest first) using MongoDB transactions
   */
  async processFIFO(
    sku: string,
    requestedQty: number,
    warehouse: string,
    session: ClientSession,
  ): Promise<{ consumed: LotConsumption[]; deficit: number }> {
    // 1. Get active lots sorted by entryDate ASC (FIFO order)
    const lots = await this.stockLotModel
      .find({ sku, warehouse, isActive: true, qty: { $gt: 0 } })
      .sort({ entryDate: 1 })
      .session(session)
      .exec();

    const consumed: LotConsumption[] = [];
    let remaining = requestedQty;

    // 2. Iterate through lots until requestedQty is covered
    for (const lot of lots) {
      if (remaining <= 0) break;

      const toConsume = Math.min(lot.qty, remaining);
      const fullyConsumed = lot.qty - toConsume <= 0;

      // 3. Guarded atomic decrement.
      // `qty: { $gte: toConsume }` is what keeps the balance from going negative:
      // the lots were read above, and a concurrent picking may have drained this
      // one since. Mongoose does not run the schema's `min: 0` validator on
      // updates, so an unguarded $inc would happily write -10.
      const res = await this.stockLotModel.updateOne(
        { _id: lot._id, qty: { $gte: toConsume } },
        {
          $inc: { qty: -toConsume },
          ...(fullyConsumed ? { $set: { isActive: false } } : {}),
        },
        { session },
      ).exec();

      // The filter did not match: the balance moved under us. Abort rather than
      // record a consumption that never left the warehouse.
      if (res.modifiedCount !== 1) {
        throw new ConflictException(
          `Concurrent update on lot ${lot.lot} (${lot.sku}): expected at least ` +
          `${toConsume} units but the balance changed. No stock was consumed for ` +
          `this line; retry the picking.`,
        );
      }

      // 4. Record traceability
      consumed.push({
        lotId: lot._id.toString(),
        lot: lot.lot,
        entryDate: lot.entryDate,
        qty: toConsume,
        unitCost: lot.unitCost,
        bsaleProductId: lot.bsaleProductId,
        rack: lot.rack,
        col: lot.col,
        row: lot.row,
        pallet: lot.pallet,
      });

      remaining -= toConsume;
    }

    // 6. Return consumed lots and any deficit
    return { consumed, deficit: Math.max(0, remaining) };
  }

  /**
   * Reserves FIFO lots for an order and returns the picking sheet.
   *
   * A-05: this used to compute the sheet without writing anything, so two orders
   * open at the same time promised the same units of the same lot and the
   * operator discovered the shortfall in the aisle. It now increments
   * `reservedQty`, guarded so it can never promise more than is available.
   */
  async reserveFIFO(
    sku: string,
    requestedQty: number,
    warehouse: string,
    session?: ClientSession,
  ): Promise<{ reserved: LotConsumption[]; deficit: number }> {
    const query = this.stockLotModel
      .find({
        sku,
        warehouse,
        isActive: true,
        $expr: { $gt: [{ $subtract: ['$qty', '$reservedQty'] }, 0] },
      })
      .sort({ entryDate: 1 });
    if (session) query.session(session);
    const lots = await query.exec();

    const reserved: LotConsumption[] = [];
    let remaining = requestedQty;

    for (const lot of lots) {
      if (remaining <= 0) break;

      const available = lot.qty - lot.reservedQty;
      if (available <= 0) continue;
      const toReserve = Math.min(available, remaining);

      const res = await this.stockLotModel.updateOne(
        {
          _id: lot._id,
          $expr: { $gte: [{ $subtract: ['$qty', '$reservedQty'] }, toReserve] },
        },
        { $inc: { reservedQty: toReserve } },
        session ? { session } : {},
      ).exec();

      // Another order reserved it first. Skip this lot rather than over-promise;
      // whatever is left shows up as deficit.
      if (res.modifiedCount !== 1) continue;

      reserved.push({
        lotId: lot._id.toString(),
        lot: lot.lot,
        entryDate: lot.entryDate,
        qty: toReserve,
        unitCost: lot.unitCost,
        bsaleProductId: lot.bsaleProductId,
        rack: lot.rack,
        col: lot.col,
        row: lot.row,
        pallet: lot.pallet,
      });

      remaining -= toReserve;
    }

    return { reserved, deficit: Math.max(0, remaining) };
  }

  /**
   * Gives reserved units back to the pool — on cancel, and just before the order
   * consumes them, so an order is never blocked by its own reservation.
   *
   * The pipeline update clamps at zero in a single atomic step, so a ledger that
   * has drifted (manual adjustment, archived lot) cannot drive reservedQty
   * negative or wipe another order's reservation on the same lot.
   */
  async releaseReservations(
    lots: { lotId: string; qty: number }[],
    session?: ClientSession,
  ): Promise<number> {
    let released = 0;

    for (const entry of lots) {
      if (!entry.qty || entry.qty <= 0) continue;

      const res = await this.stockLotModel.updateOne(
        { _id: entry.lotId },
        [
          {
            $set: {
              reservedQty: { $max: [0, { $subtract: ['$reservedQty', entry.qty] }] },
            },
          },
        ],
        // Mongoose 9 rechaza un update por pipeline salvo que se declare como tal.
        // Sin este flag la llamada revienta en runtime, aunque compile y aunque
        // un doble de prueba acepte el arreglo sin chistar.
        { updatePipeline: true, ...(session ? { session } : {}) },
      ).exec();

      if (res.matchedCount === 1) released += entry.qty;
    }

    return released;
  }

  /** Start a MongoDB session for transactions */
  async startSession(): Promise<ClientSession> {
    return this.connection.startSession();
  }
}
