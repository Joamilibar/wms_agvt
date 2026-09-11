import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PackRecipeDocument = PackRecipe & Document;

@Schema({ _id: false })
export class PackComponent {
  @Prop({ required: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  /** BSale variant id of the component, when it is known. */
  @Prop({ type: String, default: null })
  bsaleVariantId!: string | null;

  /** How many units of this component one pack consumes. */
  @Prop({ required: true, min: 1 })
  qtyPerPack!: number;
}

export const PackComponentSchema = SchemaFactory.createForClass(PackComponent);

/**
 * The composition of a pack, which only the WMS can hold.
 *
 * BSale marks packs as `classification: 3` with `unlimitedStock: 1` and keeps no
 * stock for them, and its API exposes no composition at all (`/packs`,
 * `/variants/:id/pack` and `/products/:id/pack` all answer 404). So while BSale
 * remains the source of truth for the *components'* quantities, the recipe that
 * turns those into a pack is ours to maintain.
 */
@Schema({ timestamps: true, collection: 'pack_recipes' })
export class PackRecipe {
  /** The pack's own SKU in BSale (the variant `code`). */
  @Prop({ required: true, unique: true, index: true })
  packSku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, default: null })
  bsaleVariantId!: string | null;

  @Prop({ type: [PackComponentSchema], default: [] })
  components!: PackComponent[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: '' })
  notes!: string;
}

export const PackRecipeSchema = SchemaFactory.createForClass(PackRecipe);
