import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── demand events ────────────────────────────────────────────────────────────

export type DemandEventDocument = DemandEvent & Document;

/**
 * A period in which demand is expected to differ from the base — Cyber,
 * Christmas beyond the calendar factor, a winter push for duvets. The
 * uplift multiplies the forecast of the months it covers, for the
 * categories or SKUs it names, and the run says so in its reasons so the
 * effect can be measured afterwards.
 */
@Schema({ timestamps: true, collection: 'demand_events' })
export class DemandEvent {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, type: Date })
  from!: Date;

  @Prop({ required: true, type: Date })
  to!: Date;

  /** Empty means every category. */
  @Prop({ type: [String], default: [] })
  categories!: string[];

  @Prop({ type: [String], default: [] })
  skus!: string[];

  /** Multiplier on the month's demand, e.g. 1.5 = +50 %. */
  @Prop({ required: true, min: 0 })
  uplift!: number;

  @Prop({ type: String, enum: ['history', 'manual'], default: 'manual' })
  source!: 'history' | 'manual';

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: '' })
  notes!: string;
}

export const DemandEventSchema = SchemaFactory.createForClass(DemandEvent);

// ── project demands ──────────────────────────────────────────────────────────

export type ProjectDemandDocument = ProjectDemand & Document;
export const PROJECT_STATUSES = ['quote', 'confirmed', 'delivered', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

@Schema({ _id: false })
export class ProjectLine {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;
}

/**
 * A B2B project (hotel, mining camp) as a pipeline, not a series. A quote
 * is shown; a confirmed project becomes a picking order that reserves the
 * units, so the engine sees them as gone and the MOQ of the hotel line can
 * be covered with real demand instead of ninety months of retail.
 */
@Schema({ timestamps: true, collection: 'project_demands' })
export class ProjectDemand {
  @Prop({ required: true })
  number!: string;

  @Prop({ required: true })
  customer!: string;

  @Prop({ type: String, default: null })
  rut!: string | null;

  @Prop({ type: String, enum: PROJECT_STATUSES, default: 'quote', index: true })
  status!: ProjectStatus;

  @Prop({ type: Date, default: null })
  requiredDate!: Date | null;

  @Prop({ required: true, default: 'Bodega Virtual Tienda' })
  warehouse!: string;

  @Prop({ type: [SchemaFactory.createForClass(ProjectLine)], default: [] })
  lines!: ProjectLine[];

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  orderId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  orderNumber!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ default: '' })
  notes!: string;
}

export const ProjectDemandSchema = SchemaFactory.createForClass(ProjectDemand);

// ── forecast accuracy ────────────────────────────────────────────────────────

export type ForecastAccuracyDocument = ForecastAccuracy & Document;

/**
 * One row per SKU and forecast month, written when a run is made and
 * completed with the real sales when the month closes. The permanent
 * backtest: it says whether the growth and the events were right.
 */
@Schema({ timestamps: true, collection: 'forecast_accuracy' })
export class ForecastAccuracy {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  runId!: Types.ObjectId;

  @Prop({ required: true })
  runNumber!: string;

  @Prop({ required: true, index: true })
  sku!: string;

  @Prop({ required: true, index: true })
  month!: string;

  @Prop({ required: true })
  forecast!: number;

  @Prop({ type: Number, default: null })
  actual!: number | null;

  @Prop({ type: Number, default: null })
  absError!: number | null;

  @Prop({ default: 'C' })
  abc!: string;

  @Prop({ default: '' })
  origin!: string;

  @Prop({ default: '' })
  category!: string;
}

export const ForecastAccuracySchema = SchemaFactory.createForClass(ForecastAccuracy);
ForecastAccuracySchema.index({ runId: 1, sku: 1, month: 1 }, { unique: true });
