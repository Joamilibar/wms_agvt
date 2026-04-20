import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PickingLogDocument = PickingLog & Document;

@Schema()
export class PickedItem {
  @Prop({ required: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ required: true })
  lot!: string;

  @Prop({ default: '' })
  location!: string;
}

export const PickedItemSchema = SchemaFactory.createForClass(PickedItem);

@Schema({ timestamps: true })
export class PickingLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId!: Types.ObjectId;

  @Prop({ type: String, enum: ['manual', 'bsale_factura', 'bsale_boleta', 'bsale_guia', 'bsale_auto'], required: true })
  type!: string;

  @Prop({ type: String, default: null })
  bsaleDocumentId!: string | null;

  @Prop({ type: String, default: null })
  bsaleDocumentNumber!: string | null;

  @Prop({ required: true })
  client!: string;

  @Prop({ type: [PickedItemSchema], required: true })
  items!: PickedItem[];

  @Prop({ type: String, default: '' })
  notes!: string;
}

export const PickingLogSchema = SchemaFactory.createForClass(PickingLog);
