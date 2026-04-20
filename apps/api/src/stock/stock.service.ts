import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
  rack?: string;
  col?: string;
  row?: string;
  pallet?: string;
}

@Injectable()
export class StockService {
  constructor(
    @InjectModel(StockLot.name) private stockLotModel: Model<StockLotDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(dto: CreateStockLotDto, userId?: string): Promise<StockLotDocument> {
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
    const filter: Record<string, unknown> = { sku, isActive: true, qty: { $gt: 0 } };
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

      // 3. Atomic decrement with $inc
      await this.stockLotModel.updateOne(
        { _id: lot._id },
        {
          $inc: { qty: -toConsume },
          ...(lot.qty - toConsume <= 0 ? { $set: { isActive: false } } : {}),
        },
        { session },
      ).exec();

      // 5. Mark lot as inactive if fully consumed
      if (lot.qty - toConsume <= 0) {
        await this.stockLotModel.updateOne(
          { _id: lot._id },
          { $set: { isActive: false } },
          { session },
        ).exec();
      }

      // 4. Record traceability
      consumed.push({
        lotId: lot._id.toString(),
        lot: lot.lot,
        entryDate: lot.entryDate,
        qty: toConsume,
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
   * Pre-allocates FIFO lots without mutating the DB.
   * Used when an order transitions to 'in_progress' to generate the picking sheet.
   */
  async reserveFIFO(
    sku: string,
    requestedQty: number,
    warehouse: string,
  ): Promise<{ reserved: LotConsumption[]; deficit: number }> {
    const lots = await this.stockLotModel
      .find({ sku, warehouse, isActive: true, qty: { $gt: 0 } })
      .sort({ entryDate: 1 })
      .exec();

    const reserved: LotConsumption[] = [];
    let remaining = requestedQty;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const toConsume = Math.min(lot.qty, remaining);

      reserved.push({
        lotId: lot._id.toString(),
        lot: lot.lot,
        entryDate: lot.entryDate,
        qty: toConsume,
        rack: lot.rack,
        col: lot.col,
        row: lot.row,
        pallet: lot.pallet,
      });

      remaining -= toConsume;
    }

    return { reserved, deficit: Math.max(0, remaining) };
  }

  /** Start a MongoDB session for transactions */
  async startSession(): Promise<ClientSession> {
    return this.connection.startSession();
  }
}
