import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ForecastAccuracy, ForecastAccuracyDocument } from '../schemas/phase4.schemas.js';
import { SalesHistory, SalesHistoryDocument } from '../schemas/sales-history.schema.js';
import { PlanningRun, PlanningRunDocument } from '../schemas/planning-run.schema.js';
import { mk } from '../engine/demand-engine.js';

export interface AccuracyMetric {
  month: string;
  runNumber: string;
  group: string;
  skus: number;
  forecast: number;
  actual: number;
  wape: number | null;
  bias: number | null;
}

/**
 * The permanent backtest. Rows are written by each run for the month it
 * forecasts; when that month closes, the real retail units fill `actual`.
 * WAPE = Σ|error| / Σ actual; bias = Σ(forecast − actual) / Σ actual. The
 * spreadsheet's method scored WAPE 58 % with bias +17 %: that is the bar.
 */
@Injectable()
export class ForecastAccuracyService {
  private readonly logger = new Logger(ForecastAccuracyService.name);

  constructor(
    @InjectModel(ForecastAccuracy.name) private model: Model<ForecastAccuracyDocument>,
    @InjectModel(SalesHistory.name) private salesModel: Model<SalesHistoryDocument>,
    @InjectModel(PlanningRun.name) private runModel: Model<PlanningRunDocument>,
  ) {}

  async recordRun(run: PlanningRun & { _id: Types.ObjectId }): Promise<number> {
    const rows = run.results
      .filter((r) => r.base !== null)
      .map((r) => ({
        updateOne: {
          filter: { runId: run._id, sku: r.sku, month: r.yoy.month },
          update: { $set: { runNumber: run.number, forecast: r.demandNext, abc: r.abc, origin: r.origin, category: r.category } },
          upsert: true,
        },
      }));
    if (rows.length) await this.model.bulkWrite(rows, { ordered: false });
    return rows.length;
  }

  /** Fills `actual` for every closed month that still lacks it. */
  async closeMonths(asOf = new Date()): Promise<{ months: string[]; rows: number }> {
    const current = mk(asOf);
    const open = await this.model.distinct('month', { actual: null, month: { $lt: current } }).exec();
    let rows = 0;
    for (const month of open) {
      const actuals = await this.salesModel.aggregate<{ _id: string; qty: number }>([
        { $match: { month, channel: 'retail', isService: false } },
        { $group: { _id: '$sku', qty: { $sum: '$qty' } } },
      ]).exec();
      const bySku = new Map(actuals.map((a) => [a._id, a.qty]));
      const pending = await this.model.find({ month, actual: null }).exec();
      for (const p of pending) {
        const actual = Math.max(0, bySku.get(p.sku) ?? 0);
        p.actual = actual;
        p.absError = Math.abs(p.forecast - actual);
        await p.save();
        rows++;
      }
    }
    if (rows) this.logger.log(`Forecast accuracy: ${rows} rows closed for ${open.join(', ')}`);
    return { months: open, rows };
  }

  /**
   * Metrics per month and group (class, origin or category), using the run
   * that was approved for that month, or the latest one if none was.
   */
  async metrics(groupBy: 'abc' | 'origin' | 'category' = 'abc'): Promise<AccuracyMetric[]> {
    const closed = await this.model.find({ actual: { $ne: null } }).exec();
    if (closed.length === 0) return [];
    const runs = await this.runModel.find({}, { number: 1, status: 1, approvedAt: 1, createdAt: 1 }).lean<{ _id: Types.ObjectId; approvedAt?: Date | null; createdAt?: Date }[]>().exec();
    const runInfo = new Map(runs.map((r) => [String(r._id), r]));
    // Pick one run per month: an approved one (approvedAt set) else the latest created.
    const byMonth = new Map<string, string>();
    for (const row of closed) {
      const rid = String(row.runId);
      const info = runInfo.get(rid);
      const cur = byMonth.get(row.month);
      if (!cur) { byMonth.set(row.month, rid); continue; }
      const curInfo = runInfo.get(cur);
      const better = (info?.approvedAt && !curInfo?.approvedAt) || (!!info?.approvedAt === !!curInfo?.approvedAt && (info?.createdAt ?? 0) > (curInfo?.createdAt ?? 0));
      if (better) byMonth.set(row.month, rid);
    }
    const agg = new Map<string, AccuracyMetric>();
    for (const row of closed) {
      if (byMonth.get(row.month) !== String(row.runId)) continue;
      const group = groupBy === 'abc' ? row.abc : groupBy === 'origin' ? row.origin : row.category || '—';
      for (const g of [group, 'TOTAL']) {
        const key = `${row.month}|${g}`;
        const m = agg.get(key) ?? { month: row.month, runNumber: row.runNumber, group: g, skus: 0, forecast: 0, actual: 0, wape: null, bias: null };
        m.skus++; m.forecast += row.forecast; m.actual += row.actual ?? 0;
        (m as AccuracyMetric & { abs: number }).abs = ((m as AccuracyMetric & { abs?: number }).abs ?? 0) + (row.absError ?? 0);
        agg.set(key, m);
      }
    }
    return [...agg.values()].map((m) => {
      const abs = (m as AccuracyMetric & { abs?: number }).abs ?? 0;
      const out: AccuracyMetric = { ...m, forecast: Math.round(m.forecast), actual: Math.round(m.actual), wape: m.actual > 0 ? Math.round((abs / m.actual) * 1000) / 10 : null, bias: m.actual > 0 ? Math.round(((m.forecast - m.actual) / m.actual) * 1000) / 10 : null };
      delete (out as AccuracyMetric & { abs?: number }).abs;
      return out;
    }).sort((a, b) => a.month.localeCompare(b.month) || (a.group === 'TOTAL' ? 1 : b.group === 'TOTAL' ? -1 : a.group.localeCompare(b.group)));
  }
}
