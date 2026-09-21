import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WorkshopRateDocument = WorkshopRate & Document;

/**
 * The workshop's price list, versioned. Labour is a conversion cost: it is
 * quoted here and never enters the BOM, which is physical materials only.
 * Resolution: size + quality, then size, then quality, then the model-wide
 * rate (both null), then `NO_WORKSHOP_RATE` — never zero by default.
 */
@Schema({ timestamps: true, collection: 'workshop_rates' })
export class WorkshopRate {
  /** Warehouse name with role `workshop`. */
  @Prop({ required: true, index: true })
  workshop!: string;

  @Prop({ required: true, index: true })
  modelCode!: string;

  /** `Queen`, `King`… null = applies to the whole model. */
  @Prop({ type: String, default: null })
  sizeLabel!: string | null;

  /** Fabric quality of the base fabric (`500TC`, `800TC`…); null = any. The sheet prices 800/1600TC higher. */
  @Prop({ type: String, default: null })
  quality!: string | null;

  /** CLP per finished unit. */
  @Prop({ required: true, min: 0 })
  rate!: number;

  @Prop({ type: Date, required: true })
  validFrom!: Date;

  @Prop({ type: Date, default: null })
  validTo!: Date | null;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: '' })
  setBy!: string;

  @Prop({ default: '' })
  notes!: string;
}

export const WorkshopRateSchema = SchemaFactory.createForClass(WorkshopRate);
WorkshopRateSchema.index({ workshop: 1, modelCode: 1, sizeLabel: 1, quality: 1, version: 1 }, { unique: true });
