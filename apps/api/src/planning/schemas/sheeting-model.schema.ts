import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { Dimension, PanelSpec, Hems } from '../sheeting/geometry.js';

export type SheetingModelDocument = SheetingModel & Document;

export const SHEETING_FAMILIES = ['encimera', 'bajera', 'funda', 'cubreplumon', 'otro'] as const;
export type SheetingFamily = (typeof SHEETING_FAMILIES)[number];

/** A block the model was built from, kept only so the builder can reopen it. */
export interface BlockRef {
  block: string;
  params: Record<string, number | string | boolean>;
}

export interface MeasureRange {
  min: number;
  max: number;
}

@Schema({ _id: false })
export class ModelSupply {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ type: String, enum: ['un', 'kg', 'm'], default: 'un' })
  uom!: 'un' | 'kg' | 'm';
}

/**
 * A sheeting model: how many panels the product has and how big each one
 * is, as linear expressions over the quote's measures (`A`, `L`, `H`) and
 * the model's own `vars` (`F1`, `T`, `s`…).
 *
 * Versioned like `BomRecipe`: a quote stores the version it was computed
 * with, so editing a model never rewrites history. `panels` is the compiled
 * geometry the calculation reads; `blocks` is only what the builder needs
 * to reopen it. The catalogue is open — a new model is data, not code.
 */
@Schema({ timestamps: true, collection: 'sheeting_models', minimize: false })
export class SheetingModel {
  /** `ENCIMERA_CRUCERO`, `BAJERA_ELASTICADA`… defined by the user on creation. */
  @Prop({ required: true, index: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, enum: SHEETING_FAMILIES, default: 'otro' })
  family!: SheetingFamily;

  @Prop({ required: true, min: 1 })
  version!: number;

  /** Only one version per code is active. */
  @Prop({ default: true, index: true })
  isActive!: boolean;

  /** The model's own parameters: frame width, tuck, seam allowance… */
  @Prop({ type: Object, default: {} })
  vars!: Record<string, number>;

  /** Compiled geometry. The calculation reads this and nothing else. */
  @Prop({ type: Array, default: [] })
  panels!: PanelSpec[];

  @Prop({ type: Array, default: [] })
  blocks!: BlockRef[];

  /** Hem per edge; already folded into `panels`, kept to show and to recompile. */
  @Prop({ type: Object, default: {} })
  hems!: Hems;

  /** Units laid together in one cut; amortises the last row across. */
  @Prop({ default: 20, min: 1 })
  cutBatchUnits!: number;

  /** Elastic, zip, piping, tape… per finished unit. */
  @Prop({ type: [SchemaFactory.createForClass(ModelSupply)], default: [] })
  supplies!: ModelSupply[];

  /** Packaging and freight per finished unit, CLP (from the costing sheet's per-family figures). */
  @Prop({ default: 0, min: 0 })
  packagingClp!: number;

  @Prop({ default: 0, min: 0 })
  freightClp!: number;

  /** Measures the model makes sense for, per input variable. */
  @Prop({ type: Object, default: {} })
  validRange!: Record<string, MeasureRange>;

  /** Sample measures the builder previews with. */
  @Prop({ type: Object, default: {} })
  sampleVars!: Record<string, number>;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ default: '' })
  setBy!: string;

  @Prop({ default: '' })
  notes!: string;
}

export const SheetingModelSchema = SchemaFactory.createForClass(SheetingModel);
SheetingModelSchema.index({ code: 1, version: 1 }, { unique: true });

export type { Dimension, PanelSpec };
