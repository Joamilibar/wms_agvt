import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { SkuResult } from '../engine/demand-engine.js';

export type PlanningRunDocument = PlanningRun & Document;

export const RUN_STATUSES = ['draft', 'approved', 'superseded'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * One execution of the demand engine, kept whole: the parameters version,
 * the window, the stock and transit it saw, and the result per SKU. That is
 * what makes a suggestion explainable months later — the spreadsheet could
 * not even guarantee it had been recalculated.
 */
@Schema({ timestamps: true, collection: 'planning_runs' })
export class PlanningRun {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: String, enum: RUN_STATUSES, default: 'draft', index: true })
  status!: RunStatus;

  @Prop({ required: true, type: Date })
  asOf!: Date;

  @Prop({ required: true })
  fromMonth!: string;

  @Prop({ required: true })
  toMonth!: string;

  @Prop({ required: true })
  paramsVersion!: number;

  /** Warehouses whose stock counted as available for purchasing. */
  @Prop({ type: [String], default: [] })
  purchaseWarehouses!: string[];

  @Prop({ type: Object, default: {} })
  summary!: Record<string, number>;

  /** Result per SKU plus the item fields the screen needs (name, category, origin, supplier). */
  @Prop({ type: [Object], default: [] })
  results!: (SkuResult & { name: string; category: string; origin: string; supplierName: string | null; supplierId: string | null; moq: number | null; unitCost: number | null })[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  approvedAt!: Date | null;

  @Prop({ default: '' })
  notes!: string;
}

export const PlanningRunSchema = SchemaFactory.createForClass(PlanningRun);
