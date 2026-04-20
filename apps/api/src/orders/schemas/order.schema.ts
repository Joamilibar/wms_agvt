import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema()
export class OrderItemLot {
  @Prop({ type: Types.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ required: true })
  lot!: string;

  @Prop({ required: true, type: Date })
  entryDate!: Date;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ default: '' })
  location!: string;

  @Prop({ default: '' })
  rack!: string;

  @Prop({ default: '' })
  col!: string;

  @Prop({ default: '' })
  row!: string;

  @Prop({ default: '' })
  pallet!: string;
}

export const OrderItemLotSchema = SchemaFactory.createForClass(OrderItemLot);

@Schema()
export class OrderItem {
  @Prop({ required: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  requestedQty!: number;

  @Prop({ default: 0, min: 0 })
  pickedQty!: number;

  @Prop({ type: [OrderItemLotSchema], default: [] })
  lots!: OrderItemLot[];

  @Prop({ required: true, enum: ['pending', 'partial', 'completed', 'unavailable'], default: 'pending' })
  status!: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true })
  orderId!: string;

  @Prop({ required: true, enum: ['picking', 'replenishment'], default: 'picking' })
  type!: string;

  @Prop({ required: true, enum: ['pending', 'in_progress', 'completed', 'cancelled'], default: 'pending' })
  status!: string;

  @Prop({ required: true, enum: ['high', 'normal', 'low'], default: 'normal' })
  priority!: string;

  @Prop({ required: true })
  client!: string;

  @Prop({ type: String, enum: ['manual', 'bsale_factura', 'bsale_boleta', 'bsale_guia', 'bsale_auto'], default: 'manual' })
  originType!: string;

  @Prop({ type: String, default: null })
  bsaleDocumentId!: string | null;

  @Prop({ type: String, default: null })
  bsaleDocumentNumber!: string | null;

  @Prop({ type: Number, default: null })
  bsaleOfficeId!: number | null;

  @Prop({ type: String, enum: ['client', 'internal_production', 'store_restock'], default: 'client' })
  destinationType!: string;

  @Prop({ type: Boolean, default: false })
  generateGuide!: boolean;

  @Prop({ type: Number, default: null })
  bsaleClientId!: number | null;

  @Prop({ type: Number, default: null })
  bsaleDestinationOfficeId!: number | null;

  @Prop({ required: true, default: 'Central' })
  warehouse!: string;

  @Prop({ type: [OrderItemSchema], default: [] })
  items!: OrderItem[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo!: Types.ObjectId | null;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ type: Types.ObjectId, ref: 'Guide', default: null })
  guideId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  startedAt!: Date | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt!: Date | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
