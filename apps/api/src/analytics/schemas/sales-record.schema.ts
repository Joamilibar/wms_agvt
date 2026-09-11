import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SalesRecordDocument = SalesRecord & Document;

@Schema({ timestamps: false })
export class SalesRecord {
  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date;

  @Prop({ required: true, index: true })
  sku!: string;

  @Prop({ required: true })
  warehouse!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  /**
   * Whether unitPrice is a real sale price or the lot's cost standing in.
   * Without it, a cost-weighted ABC is indistinguishable from a revenue-
   * weighted one, and the two answer different questions.
   */
  @Prop({ required: true, enum: ['bsale_document', 'lot_cost', 'seed'], default: 'lot_cost' })
  priceSource!: string;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  orderId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Guide', default: null })
  guideId!: Types.ObjectId | null;
}

export const SalesRecordSchema = SchemaFactory.createForClass(SalesRecord);

SalesRecordSchema.index({ timestamp: 1, sku: 1 });
SalesRecordSchema.index({ sku: 1, timestamp: -1 });
