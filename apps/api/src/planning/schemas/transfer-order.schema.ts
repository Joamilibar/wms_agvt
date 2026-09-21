import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransferOrderDocument = TransferOrder & Document;

export const TRANSFER_STATUSES = ['draft', 'approved', 'picking', 'delivered', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const TRANSFER_DIRECTIONS = ['send', 'withdraw'] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

@Schema({ _id: false })
export class TransferLine {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  /** What the plan proposed, kept for the record. */
  @Prop({ required: true, min: 0 })
  qtySuggested!: number;

  @Prop({ required: true, min: 0 })
  qtyApproved!: number;

  @Prop({ required: true, min: 0, default: 0 })
  qtyDelivered!: number;

  /** The numbers behind the suggestion at the time of the plan. */
  @Prop({ type: Object, default: {} })
  snapshot!: { ideal: number; stockStore: number; inTransit: number; availableSource: number; idealSource: string };

  @Prop({ default: '' })
  reason!: string;
}

export const TransferLineSchema = SchemaFactory.createForClass(TransferLine);

/**
 * A movement between the warehouse and a store: a shipment (`send`) or a
 * withdrawal of what does not sell (`withdraw`). Approval creates the
 * picking order that reserves the stock (D12: supervisor); delivery creates
 * the lots at the destination. What is approved and not delivered is the
 * store's "in transit", so the next plan does not ask for it again.
 */
@Schema({ timestamps: true, collection: 'transfer_orders' })
export class TransferOrder {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: String, enum: TRANSFER_DIRECTIONS, required: true })
  direction!: TransferDirection;

  @Prop({ required: true })
  fromWarehouse!: string;

  @Prop({ required: true, index: true })
  toWarehouse!: string;

  @Prop({ type: String, enum: TRANSFER_STATUSES, default: 'draft', index: true })
  status!: TransferStatus;

  @Prop({ type: [TransferLineSchema], default: [] })
  lines!: TransferLine[];

  /** The WMS picking order that reserves and consumes the stock at the origin. */
  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  pickingOrderId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  pickingOrderNumber!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  approvedAt!: Date | null;

  @Prop({ type: Date, default: null })
  deliveredAt!: Date | null;

  @Prop({ default: '' })
  notes!: string;
}

export const TransferOrderSchema = SchemaFactory.createForClass(TransferOrder);
