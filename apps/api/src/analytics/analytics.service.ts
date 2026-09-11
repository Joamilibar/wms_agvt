import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CacheService } from '../common/cache/cache.service.js';
import { Model } from 'mongoose';
import { SalesRecord, SalesRecordDocument } from './schemas/sales-record.schema.js';
import { StockLot, StockLotDocument } from '../stock/schemas/stock-lot.schema.js';

@Injectable()
export class AnalyticsService {
  /** M-04: short enough that a missed invalidation self-heals in minutes. */
  private static readonly TTL = 300;

  constructor(
    @InjectModel(SalesRecord.name) private salesModel: Model<SalesRecordDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    private cache: CacheService,
  ) {}

  /** ABC Analysis using MongoDB Aggregation Pipeline */
  async computeABC(warehouse?: string, periodDays = 90) {
    return this.cache.wrap('analytics:abc:' + (warehouse ?? 'all') + ':' + periodDays, AnalyticsService.TTL, () =>
      this.computeABCUncached(warehouse, periodDays),
    );
  }

  private async computeABCUncached(warehouse?: string, periodDays = 90) {
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

    // Enrich with current stock.
    // M-04: this used to run one aggregation per SKU in the result — invisible
    // with 16 lots, an N+1 against a real catalogue. One grouped aggregation
    // now covers every SKU at once.
    const skus = result.map((item) => item._id);
    const stockMatch: Record<string, unknown> = { sku: { $in: skus }, isActive: true };
    if (warehouse) stockMatch.warehouse = warehouse;

    const stockAgg = await this.stockModel.aggregate([
      { $match: stockMatch },
      {
        $group: {
          _id: '$sku',
          totalQty: { $sum: '$qty' },
          totalValue: { $sum: { $multiply: ['$qty', '$unitCost'] } },
        },
      },
    ]).exec();

    const stockBySku = new Map(stockAgg.map((s: any) => [s._id, s]));

    for (const item of result) {
      const stock = stockBySku.get(item._id);
      item.currentStock = stock?.totalQty || 0;
      item.currentValue = stock?.totalValue || 0;
    }

    // What the classification is actually weighted on. A SalesRecord written
    // from a BSale document carries a real sale price; one from a manual order
    // falls back to the lot's cost, and the seed's is invented. Ranking by
    // revenue and ranking by cost answer different questions, so the caller is
    // told which mix it is looking at instead of having to assume.
    const basisAgg = await this.salesModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$priceSource',
          value: { $sum: { $multiply: ['$qty', '$unitPrice'] } },
        },
      },
    ]).exec();

    const byBasis: Record<string, number> = { bsale_document: 0, lot_cost: 0, seed: 0 };
    for (const row of basisAgg) {
      byBasis[row._id ?? 'lot_cost'] = row.value || 0;
    }
    const basisTotal = Object.values(byBasis).reduce((sum, v) => sum + v, 0);

    return {
      items: result,
      priceBasis: {
        ...byBasis,
        // Share of the ranked value that comes from a real sale price.
        revenueShare: basisTotal > 0 ? byBasis.bsale_document / basisTotal : 0,
      },
    };
  }

  /**
   * Coverage Days: stock / daily average sales.
   *
   * M-05: dailyRate used to divide the period's quantity by the number of
   * *distinct days that had a movement*. A SKU selling 100 units across 5 days
   * of the 90-day window came out at 20/day instead of 1.1/day, so its coverage
   * was understated by ~18x and slow, sporadic movers — precisely the ones worth
   * watching — were reported as "critico" without being so.
   *
   * The denominator is now elapsed time: days since that SKU's first sale,
   * capped to the window, so a product introduced two weeks ago is measured
   * over two weeks rather than over the full 90 days.
   */
  async computeCoverage(warehouse?: string) {
    return this.cache.wrap('analytics:coverage:' + (warehouse ?? 'all'), AnalyticsService.TTL, () =>
      this.computeCoverageUncached(warehouse),
    );
  }

  private async computeCoverageUncached(warehouse?: string) {
    const PERIOD_DAYS = 90;
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - PERIOD_DAYS);

    const salesMatch: Record<string, unknown> = { timestamp: { $gte: startDate } };
    if (warehouse) salesMatch.warehouse = warehouse;

    // Daily sales average per SKU
    const salesData = await this.salesModel.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: '$sku',
          totalQty: { $sum: '$qty' },
          firstSale: { $min: '$timestamp' },
        },
      },
      {
        $addFields: {
          daysInWindow: {
            $max: [
              1,
              {
                $min: [
                  PERIOD_DAYS,
                  { $ceil: { $divide: [{ $subtract: [now, '$firstSale'] }, MS_PER_DAY] } },
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          dailyRate: { $divide: ['$totalQty', '$daysInWindow'] },
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
      const daysInWindow = sales?.daysInWindow || PERIOD_DAYS;
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
        // Days the rate was averaged over, so the UI can state the criterion.
        daysInWindow,
        coverageDays: coverageDays === Infinity ? -1 : coverageDays,
        status,
      };
    }).sort((a: any, b: any) => (b.coverageDays === -1 ? -1 : b.coverageDays) - (a.coverageDays === -1 ? -1 : a.coverageDays));
  }

  /** Aging Report: days since entry per lot */
  async computeAging(warehouse?: string) {
    return this.cache.wrap('analytics:aging:' + (warehouse ?? 'all'), AnalyticsService.TTL, () =>
      this.computeAgingUncached(warehouse),
    );
  }

  private async computeAgingUncached(warehouse?: string) {
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

      // Build a human-readable location from sub-fields
      const locationParts = [
        lot.rack  ? `Rack ${lot.rack}`  : '',
        lot.col   ? `Col ${lot.col}`    : '',
        lot.row   ? `Fila ${lot.row}`   : '',
        lot.pallet? `Pallet ${lot.pallet}` : '',
      ].filter(Boolean);

      const locationLabel = lot.location
        ? lot.location
        : locationParts.length > 0
          ? locationParts.join(' / ')
          : 'Sin ubicación asignada';

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
        location: locationLabel,
        rack: lot.rack,
        col: lot.col,
        row: lot.row,
        pallet: lot.pallet,
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
    return this.cache.wrap('analytics:dashboard:' + (warehouse ?? 'all'), AnalyticsService.TTL, () =>
      this.getDashboardKPIsUncached(warehouse),
    );
  }

  private async getDashboardKPIsUncached(warehouse?: string) {
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
