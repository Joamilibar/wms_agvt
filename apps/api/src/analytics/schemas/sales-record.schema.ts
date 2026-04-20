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

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  orderId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Guide', default: null })
  guideId!: Types.ObjectId | null;
}

export const SalesRecordSchema = SchemaFactory.createForClass(SalesRecord);

SalesRecordSchema.index({ timestamp: 1, sku: 1 });
SalesRecordSchema.index({ sku: 1, timestamp: -1 });
