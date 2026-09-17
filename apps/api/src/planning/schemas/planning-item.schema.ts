import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlanningItemDocument = PlanningItem & Document;

export const ORIGINS = ['imported', 'national', 'raw_material', 'supply', 'pack', 'service', 'unknown'] as const;
export type Origin = (typeof ORIGINS)[number];

export const LIFECYCLES = ['new', 'active', 'phase_out', 'discontinued'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

/**
 * The supply-side master of a SKU: where it comes from, how long it takes and
 * in what quantities it can be ordered. One record per SKU — the spreadsheet
 * kept this across a hand-typed list of 418 rows and a lead-time sheet where a
 * SKU could appear twice with two suppliers.
 *
 * Fields left null are inherited from the supplier at calculation time. An
 * imported item with no supplier is the first alert the planning screen
 * raises: without lead time its reorder point is only the safety stock.
 */
@Schema({ timestamps: true, collection: 'planning_items' })
export class PlanningItem {
  @Prop({ required: true, unique: true, index: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ default: '' })
  category!: string;

  @Prop({ type: String, enum: ORIGINS, default: 'unknown', index: true })
  origin!: Origin;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', default: null, index: true })
  supplierId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  leadTimeDays!: number | null;

  @Prop({ type: Number, default: null })
  transitDays!: number | null;

  /** Minimum order quantity, null = none. */
  @Prop({ type: Number, default: null })
  moq!: number | null;

  @Prop({ required: true, min: 1, default: 1 })
  orderMultiple!: number;

  /** Groups SKUs that share a supplier minimum (same fabric/colour, several sizes). */
  @Prop({ type: String, default: null })
  familyKey!: string | null;

  @Prop({ type: String, enum: LIFECYCLES, default: 'active', index: true })
  lifecycle!: Lifecycle;

  /** Inferred as the first sale unless set by hand (D14). */
  @Prop({ type: Date, default: null })
  launchDate!: Date | null;

  @Prop({ type: String, default: null })
  successorSku!: string | null;

  /** A SKU whose history stands in for this one while it is new. */
  @Prop({ type: String, default: null })
  analogSku!: string | null;

  /** Hotel line (SKU prefix H). An attribute for presentation and supplier defaults, never the channel rule. */
  @Prop({ default: false })
  isHotelLine!: boolean;

  @Prop({ type: Number, default: null })
  fobCost!: number | null;

  @Prop({ type: String, default: null })
  costCurrency!: string | null;

  @Prop({ default: '' })
  notes!: string;
}

export const PlanningItemSchema = SchemaFactory.createForClass(PlanningItem);
