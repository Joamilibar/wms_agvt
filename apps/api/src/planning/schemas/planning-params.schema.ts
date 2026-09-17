import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanningParamsDocument = PlanningParams & Document;

/**
 * Every knob of the planning engine, versioned: a new document is written on
 * each change and a run records the version it used, so any suggestion can be
 * traced back to the parameters that produced it.
 *
 * The history window is deliberately not here: it is a rule of the system
 * (from 2025-01-01, never more than 24 months), see `history-window.ts`.
 */
@Schema({ timestamps: true, collection: 'planning_params' })
export class PlanningParams {
  @Prop({ required: true, index: true })
  version!: number;

  // ── channel ────────────────────────────────────────────────────────────────
  /** A document with at least this many units from a company RUT is a project (D1). */
  @Prop({ default: 30 })
  projectMinUnits!: number;

  /** BSale office names whose every document is a project (D5: Bodega Principal). */
  @Prop({ type: [String], default: ['Bodega Principal San Martin'] })
  projectOffices!: string[];

  /** Chilean company RUTs fall in this numeric range. */
  @Prop({ default: 50_000_000 })
  companyRutMin!: number;

  @Prop({ default: 100_000_000 })
  companyRutMax!: number;

  /** Percentile of units per retail document above which a document is an outlier. */
  @Prop({ default: 99 })
  outlierPercentile!: number;

  // ── forecast ───────────────────────────────────────────────────────────────
  /** Weight of the 12-month average in the base forecast; the rest is the 6-month average. */
  @Prop({ default: 0.5 })
  baseWeight12m!: number;

  /** Growth applied on top of the base forecast (D3: 30 %), overridable per category. */
  @Prop({ default: 0.3 })
  growthDefault!: number;

  @Prop({ type: Object, default: {} })
  growthByCategory!: Record<string, number>;

  /** Alert when forecast and same month last year differ by more than this fraction (D2). */
  @Prop({ default: 0.5 })
  yoyAlertPct!: number;

  /** Whether the year-over-year comparison multiplies the forecast. Off until two years overlap (D2). */
  @Prop({ default: false })
  yoyMultiplierEnabled!: boolean;

  // ── safety stock and reorder ───────────────────────────────────────────────
  /** Safety stock in months of demand, by origin (D4). */
  @Prop({ default: 4 })
  ssMonthsImported!: number;

  @Prop({ default: 1 })
  ssMonthsNational!: number;

  /** Service-level Z by ABC class, shown as a reference next to the rule above. */
  @Prop({ type: Object, default: { A: 2.05, B: 1.65, C: 1.28 } })
  zByClass!: Record<string, number>;

  @Prop({ default: 30 })
  reviewDays!: number;

  @Prop({ default: 30 })
  nationalLeadTimeDays!: number;

  /** A MOQ covering more months than this is flagged instead of ordered (D7). */
  @Prop({ default: 18 })
  moqMaxCoverageMonths!: number;

  @Prop({ default: 2 })
  overstockExtraMonths!: number;

  /** No sales for this long with stock on hand → phase-out candidate. */
  @Prop({ default: 6 })
  phaseOutMonths!: number;

  /** Under this many months with sales a SKU is "new" and gets no statistical forecast. */
  @Prop({ default: 3 })
  newSkuMonths!: number;

  // ── store replenishment (D10) ──────────────────────────────────────────────
  @Prop({ default: 7 })
  storeCycleDays!: number;

  @Prop({ default: 2 })
  storeDeliveryDays!: number;

  @Prop({ type: Object, default: { A: 1, B: 1, C: 0 } })
  storeDisplayMin!: Record<string, number>;

  @Prop({ default: 90 })
  storeDemandWindowDays!: number;

  /** Above this many units in one delivery the week's replenishment is split in two. */
  @Prop({ default: 60 })
  storeSplitDeliveryUnits!: number;

  // ── production ─────────────────────────────────────────────────────────────
  @Prop({ default: 0.03 })
  scrapPct!: number;

  @Prop({ default: '' })
  changedBy!: string;

  @Prop({ default: '' })
  changeNote!: string;
}

export const PlanningParamsSchema = SchemaFactory.createForClass(PlanningParams);
