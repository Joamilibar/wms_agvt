import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SalesRecord, SalesRecordDocument } from './schemas/sales-record.schema.js';
import { StockLot, StockLotDocument } from '../stock/schemas/stock-lot.schema.js';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(SalesRecord.name) private salesModel: Model<SalesRecordDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
  ) {}

  /** ABC Analysis using MongoDB Aggregation Pipeline */
  async computeABC(warehouse?: string, periodDays = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const matchStage: Record<string, unknown> = { timestamp: { $gte: startDate } };
    if (warehouse) matchStage.warehouse = warehouse;

    const result = await this.salesModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$sku',
          totalQty: { $sum: '$qty' },
          totalValue: { $sum: { $multiply: ['$qty', '$unitPrice'] } },
        },
      },
      { $sort: { totalValue: -1 } },
      {
        $setWindowFields: {
          sortBy: { totalValue: -1 },
          output: {
            cumulativeValue: { $sum: '$totalValue', window: { documents: ['unbounded', 'current'] } },
            grandTotal: { $sum: '$totalValue', window: { documents: ['unbounded', 'unbounded'] } },
          },
        },
      },
      {
        $addFields: {
          cumulativePercent: {
            $cond: [
              { $eq: ['$grandTotal', 0] },
              0,
              { $multiply: [{ $divide: ['$cumulativeValue', '$grandTotal'] }, 100] },
            ],
          },
        },
      },
      {
        $addFields: {
          class: {
            $cond: [
              { $lte: ['$cumulativePercent', 80] }, 'A',
              { $cond: [{ $lte: ['$cumulativePercent', 95] }, 'B', 'C'] },
            ],
          },
        },
      },
    ]).exec();

    // Enrich with current stock
    for (const item of result) {
      const stockMatch: Record<string, unknown> = { sku: item._id, isActive: true };
      if (warehouse) stockMatch.warehouse = warehouse;

      const stockAgg = await this.stockModel.aggregate([
        { $match: stockMatch },
        { $group: { _id: null, totalQty: { $sum: '$qty' }, totalValue: { $sum: { $multiply: ['$qty', '$unitCost'] } } } },
      ]).exec();

      item.currentStock = stockAgg[0]?.totalQty || 0;
      item.currentValue = stockAgg[0]?.totalValue || 0;
    }

    return result;
  }

  /** Coverage Days: stock / daily average sales */
  async computeCoverage(warehouse?: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const salesMatch: Record<string, unknown> = { timestamp: { $gte: startDate } };
    if (warehouse) salesMatch.warehouse = warehouse;

    // Daily sales average per SKU
    const salesData = await this.salesModel.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: '$sku',
          totalQty: { $sum: '$qty' },
          daysActive: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } },
        },
      },
      {
        $addFields: {
          dailyRate: { $cond: [{ $eq: [{ $size: '$daysActive' }, 0] }, 0, { $divide: ['$totalQty', { $size: '$daysActive' }] }] },
        },
      },
    ]).exec();

    // Current stock per SKU
    const stockMatch: Record<string, unknown> = { isActive: true };
    if (warehouse) stockMatch.warehouse = warehouse;

    const stockData = await this.stockModel.aggregate([
      { $match: stockMatch },
      { $group: { _id: '$sku', name: { $first: '$name' }, totalQty: { $sum: '$qty' } } },
    ]).exec();

    const salesMap = new Map(salesData.map((s: any) => [s._id, s]));

    return stockData.map((stock: any) => {
      const sales = salesMap.get(stock._id);
      const dailyRate = sales?.dailyRate || 0;
      const coverageDays = dailyRate > 0 ? Math.round(stock.totalQty / dailyRate) : Infinity;

      let status: string;
      if (dailyRate === 0) status = 'sin_movimiento';
      else if (coverageDays <= 7) status = 'critico';
      else if (coverageDays <= 30) status = 'alto';
      else if (coverageDays <= 90) status = 'normal';
      else status = 'bajo';

      return {
        sku: stock._id,
        name: stock.name,
        currentStock: stock.totalQty,
        dailyRate: Math.round(dailyRate * 100) / 100,
        coverageDays: coverageDays === Infinity ? -1 : coverageDays,
        status,
      };
    }).sort((a: any, b: any) => (b.coverageDays === -1 ? -1 : b.coverageDays) - (a.coverageDays === -1 ? -1 : a.coverageDays));
  }

  /** Aging Report: days since entry per lot */
  async computeAging(warehouse?: string) {
    const match: Record<string, unknown> = { isActive: true, qty: { $gt: 0 } };
    if (warehouse) match.warehouse = warehouse;

    const now = new Date();

    const lots = await this.stockModel.find(match).sort({ entryDate: 1 }).exec();

    return lots.map((lot) => {
      const days = Math.floor((now.getTime() - lot.entryDate.getTime()) / (1000 * 60 * 60 * 24));
      const value = lot.qty * lot.unitCost;

      let bucket: string;
      if (days <= 30) bucket = '0-30';
      else if (days <= 60) bucket = '31-60';
      else if (days <= 90) bucket = '61-90';
      else if (days <= 120) bucket = '91-120';
      else if (days <= 180) bucket = '121-180';
      else bucket = '>180';

      let risk: string;
      if (days <= 60) risk = 'ok';
      else if (days <= 90) risk = 'medio';
      else if (days <= 120) risk = 'alto';
      else risk = 'critico';

      return {
        lotId: lot._id.toString(),
        sku: lot.sku,
        name: lot.name,
        lot: lot.lot,
        entryDate: lot.entryDate,
        days,
        qty: lot.qty,
        unitCost: lot.unitCost,
        value,
        warehouse: lot.warehouse,
        location: lot.location,
        bucket,
        risk,
      };
    });
  }

  /** Aging Summary: total immobilized value by bucket */
  async getAgingSummary(warehouse?: string) {
    const aging = await this.computeAging(warehouse);
    const buckets: Record<string, { count: number; totalQty: number; totalValue: number }> = {
      '0-30': { count: 0, totalQty: 0, totalValue: 0 },
      '31-60': { count: 0, totalQty: 0, totalValue: 0 },
      '61-90': { count: 0, totalQty: 0, totalValue: 0 },
      '91-120': { count: 0, totalQty: 0, totalValue: 0 },
      '121-180': { count: 0, totalQty: 0, totalValue: 0 },
      '>180': { count: 0, totalQty: 0, totalValue: 0 },
    };

    let totalValue = 0;
    for (const lot of aging) {
      buckets[lot.bucket].count++;
      buckets[lot.bucket].totalQty += lot.qty;
      buckets[lot.bucket].totalValue += lot.value;
      totalValue += lot.value;
    }

    return { buckets, totalValue, totalLots: aging.length };
  }

  /** Dashboard KPIs */
  async getDashboardKPIs(warehouse?: string) {
    const stockMatch: Record<string, unknown> = { isActive: true };
    if (warehouse) stockMatch.warehouse = warehouse;

    const [totalLots, totalSkus, totalValueAgg, aging, coverage] = await Promise.all([
      this.stockModel.countDocuments(stockMatch).exec(),
      this.stockModel.distinct('sku', stockMatch).exec(),
      this.stockModel.aggregate([
        { $match: stockMatch },
        { $group: { _id: null, total: { $sum: { $multiply: ['$qty', '$unitCost'] } }, totalQty: { $sum: '$qty' } } },
      ]).exec(),
      this.computeAging(warehouse),
      this.computeCoverage(warehouse),
    ]);

    const agingAlerts = aging.filter((l) => l.days > 90).length;
    const coverageAlerts = coverage.filter((c: any) => c.status === 'critico').length;
    const totalValue = totalValueAgg[0]?.total || 0;
    const totalQty = totalValueAgg[0]?.totalQty || 0;

    return {
      totalSkus: totalSkus.length,
      totalLots,
      totalQty,
      totalValue,
      agingAlerts,
      coverageAlerts,
      warehouses: await this.stockModel.distinct('warehouse', stockMatch).exec(),
    };
  }

  /** Sales Trend for a specific SKU */
  async getSalesTrend(sku: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.salesModel.aggregate([
      { $match: { sku, timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          totalQty: { $sum: '$qty' },
          totalValue: { $sum: { $multiply: ['$qty', '$unitPrice'] } },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();
  }
}
