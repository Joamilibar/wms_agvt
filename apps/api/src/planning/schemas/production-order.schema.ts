import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { Uom } from './bom-recipe.schema.js';

export type ProductionOrderDocument = ProductionOrder & Document;

export const OP_STATUSES = ['draft', 'approved', 'in_progress', 'completed', 'cancelled'] as const;
export type OpStatus = (typeof OP_STATUSES)[number];

@Schema({ _id: false })
export class ProductionLine {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ required: true, min: 0, default: 0 })
  qtyProduced!: number;

  @Prop({ required: true })
  recipeVersion!: number;

  @Prop({ default: '' })
  reason!: string;
}

@Schema({ _id: false })
export class MaterialLine {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ type: String, default: 'un' })
  uom!: Uom;

  /** Required by the explosion, scrap included. */
  @Prop({ required: true, min: 0 })
  required!: number;

  @Prop({ required: true, min: 0, default: 0 })
  available!: number;

  @Prop({ required: true, min: 0, default: 0 })
  consumed!: number;
}

/**
 * A batch to make at a workshop: the finished lines, the materials the
 * explosion asked for, and — once completed — the lots consumed at the
 * workshop and the lot created at the destination. The finished lot gets
 * the real date and the cost of what went into it, so the aging of a
 * national duvet is true from the day it was filled.
 */
@Schema({ timestamps: true, collection: 'production_orders' })
export class ProductionOrder {
  @Prop({ required: true, unique: true })
  number!: string;

  /** Warehouse of the workshop where materials are consumed. */
  @Prop({ required: true })
  workshop!: string;

  @Prop({ required: true, default: 'Bodega Virtual Tienda' })
  destinationWarehouse!: string;

  @Prop({ type: String, enum: OP_STATUSES, default: 'draft', index: true })
  status!: OpStatus;

  @Prop({ type: [SchemaFactory.createForClass(ProductionLine)], default: [] })
  lines!: ProductionLine[];

  @Prop({ type: [SchemaFactory.createForClass(MaterialLine)], default: [] })
  materials!: MaterialLine[];

  @Prop({ type: [Object], default: [] })
  consumedLots!: { sku: string; lot: string; qty: number; unitCost: number; warehouse: string }[];

  @Prop({ type: [String], default: [] })
  producedLots!: string[];

  @Prop({ type: Types.ObjectId, default: null })
  planningRunId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  approvedAt!: Date | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ default: '' })
  notes!: string;
}

export const ProductionOrderSchema = SchemaFactory.createForClass(ProductionOrder);
