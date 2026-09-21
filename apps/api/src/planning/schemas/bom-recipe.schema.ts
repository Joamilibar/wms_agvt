import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BomRecipeDocument = BomRecipe & Document;

export const UOMS = ['un', 'kg', 'm'] as const;
export type Uom = (typeof UOMS)[number];

@Schema({ _id: false })
export class BomComponent {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  /** Quantity of the component per one unit of the parent, in `uom`. */
  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ type: String, enum: UOMS, default: 'un' })
  uom!: Uom;

  /** Extra fraction lost in the process for this component; null = the global parameter. */
  @Prop({ type: Number, default: null })
  scrapPct!: number | null;
}

export const BomComponentSchema = SchemaFactory.createForClass(BomComponent);

/**
 * The recipe of a made product: what goes into one unit, in physical units
 * (a cover in pieces, down in kilos, fabric in metres). A mix is expressed
 * as the quantities of each filling, not as a loose percentage. Versioned:
 * a production order points at the version it was made with, so changing a
 * mix later does not rewrite history.
 *
 * Digitised from Cálculo_Plumas and Cálculo_Insumos (D8); sheets sets are
 * entered on the screen.
 */
@Schema({ timestamps: true, collection: 'bom_recipes' })
export class BomRecipe {
  @Prop({ required: true, index: true })
  parentSku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ required: true, min: 1 })
  version!: number;

  /** Only one version per parent is active; older ones stay for the record. */
  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ type: [BomComponentSchema], default: [] })
  components!: BomComponent[];

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '' })
  setBy!: string;
}

export const BomRecipeSchema = SchemaFactory.createForClass(BomRecipe);
BomRecipeSchema.index({ parentSku: 1, version: 1 }, { unique: true });
