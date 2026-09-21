import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WorkshopRateDocument = WorkshopRate & Document;

/**
 * The workshop's price list, versioned. Labour is a conversion cost: it is
 * quoted here and never enters the BOM, which is physical materials only.
 * Resolution: exact `sizeLabel` first, then the family fallback
 * (`sizeLabel: null`), then `NO_WORKSHOP_RATE` — never zero by default.
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
WorkshopRateSchema.index({ workshop: 1, modelCode: 1, sizeLabel: 1, version: 1 }, { unique: true });
