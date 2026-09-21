import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FabricSpecDocument = FabricSpec & Document;

/**
 * A fabric as a physical input: one per fabric SKU. The roll width is the
 * number that decides the whole nesting — it is never a constant anywhere
 * in the code, because linen alone comes in 2.90 and 1.35 m.
 */
@Schema({ timestamps: true, collection: 'fabric_specs' })
export class FabricSpec {
  /** Links to `PlanningItem` and to the BSale variant. */
  @Prop({ required: true, unique: true, index: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ required: true, min: 1 })
  rollWidthCm!: number;

  /** Selvage trimmed on each side. */
  @Prop({ default: 1, min: 0 })
  selvageCm!: number;

  /** A nap or a directional print: the piece cannot be turned across the grain. */
  @Prop({ default: false })
  directional!: boolean;

  /** `500TC`, `800TC`, `1600TC`, `Lino`, `180H`… */
  @Prop({ default: '' })
  quality!: string;

  @Prop({ type: String, default: null })
  bsaleVariantId!: string | null;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: '' })
  notes!: string;
}

export const FabricSpecSchema = SchemaFactory.createForClass(FabricSpec);
