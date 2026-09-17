import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PurchaseOrderDocument = PurchaseOrder & Document;

export const PO_STATUSES = ['draft', 'approved', 'sent', 'partial', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** Statuses whose undelivered quantity counts as in transit. */
export const PO_OPEN_STATUSES: PoStatus[] = ['approved', 'sent', 'partial'];

@Schema({ _id: false })
export class PurchaseOrderLine {
  @Prop({ required: true })
  sku!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ required: true, min: 0 })
  qtyOrdered!: number;

  @Prop({ required: true, min: 0, default: 0 })
  qtyReceived!: number;

  /** Estimated arrival at the destination warehouse. Null means unknown — the line still counts as transit but is flagged. */
  @Prop({ type: Date, default: null })
  eta!: Date | null;

  @Prop({ type: Number, default: null })
  unitCost!: number | null;
}

export const PurchaseOrderLineSchema = SchemaFactory.createForClass(PurchaseOrderLine);

/**
 * What has been ordered and not yet received. This is the only source of
 * "in transit" for the engine — it replaces the hand-kept sheet that listed
 * the same SKU twice and had the lookup take the first row.
 */
@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', default: null, index: true })
  supplierId!: Types.ObjectId | null;

  @Prop({ default: '' })
  supplierName!: string;

  @Prop({ type: String, enum: PO_STATUSES, default: 'draft', index: true })
  status!: PoStatus;

  @Prop({ default: 'USD' })
  currency!: string;

  @Prop({ type: Number, default: null })
  fxRate!: number | null;

  @Prop({ required: true, default: 'Bodega Virtual Tienda' })
  destinationWarehouse!: string;

  @Prop({ type: [PurchaseOrderLineSchema], default: [] })
  lines!: PurchaseOrderLine[];

  /** Where the order came from: a planning run, a hand entry, or the initial load of in-transit goods. */
  @Prop({ default: 'manual' })
  source!: string;

  @Prop({ type: Types.ObjectId, default: null })
  planningRunId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  approvedAt!: Date | null;

  @Prop({ default: '' })
  notes!: string;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
