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
 * The composition of a pack, mirrored here so pack stock can be computed.
 *
 * BSale marks packs as `classification: 3` with `unlimitedStock: 1` and keeps no
 * stock for them. It does carry the composition, inline as `pack_details` on
 * the product (there is no pack endpoint), and `POST /packs/import-bsale`
 * copies it here. Recipes can also be entered by hand for bundles BSale does
 * not know about; the import leaves those alone.
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
