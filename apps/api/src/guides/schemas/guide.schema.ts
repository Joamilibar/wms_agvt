import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GuideDocument = Guide & Document;

@Schema()
export class GuideItemLot {
  @Prop({ required: true })
  lot!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;
}

export const GuideItemLotSchema = SchemaFactory.createForClass(GuideItemLot);

@Schema()
export class GuideItem {
  @Prop({ required: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ required: true, min: 0 })
  unitCost!: number;

  /**
   * BSale variant id for this line, copied from the consumed lot's
   * `bsaleProductId`. A-02: it used to be guessed from the digits in the
   * SKU (`SKU-001` -> variant 1), which pointed guide lines at arbitrary
   * products in the BSale catalogue.
   */
  @Prop({ type: String, default: null })
  bsaleVariantId!: string | null;

  @Prop({ type: [GuideItemLotSchema], default: [] })
  lots!: GuideItemLot[];
}

export const GuideItemSchema = SchemaFactory.createForClass(GuideItem);

@Schema({ timestamps: true })
export class Guide {
  @Prop({ required: true, unique: true })
  guideId!: string;

  @Prop({ required: true, enum: ['internal', 'external'] })
  type!: string;

  // External fields
  @Prop({ type: String, default: null })
  client!: string | null;

  @Prop({ type: String, default: null })
  clientRut!: string | null;

  @Prop({ type: String, default: null })
  clientAddress!: string | null;

  // Internal fields
  @Prop({ type: String, default: null })
  originWarehouse!: string | null;

  @Prop({ type: String, default: null })
  destinationWarehouse!: string | null;

  @Prop({ type: [GuideItemSchema], default: [] })
  items!: GuideItem[];

  @Prop({ required: true, enum: ['draft', 'emitted', 'in_transit', 'received', 'cancelled'], default: 'draft' })
  status!: string;

  // BSale integration
  @Prop({ enum: ['pending', 'synced', 'error', 'not_applicable'], default: 'not_applicable' })
  bsaleStatus!: string;

  @Prop({ type: String, default: null })
  bsaleDocumentId!: string | null;

  @Prop({ type: String, default: null })
  bsaleShippingId!: string | null;

  // Emission context, captured when the guide is created, so a retry does
  // not have to reach back into the order.
  @Prop({ type: Number, default: null })
  bsaleOfficeId!: number | null;

  @Prop({ type: String, default: null })
  bsaleReferenceNumber!: string | null;

  @Prop({ type: Number, default: null })
  bsaleReferenceCodeSii!: number | null;

  @Prop({ type: Date, default: null })
  bsaleSyncedAt!: Date | null;

  @Prop({ type: String, default: null })
  bsaleError!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  orderId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  emittedBy!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  emittedAt!: Date | null;

  @Prop({ type: Date, default: null })
  receivedAt!: Date | null;

  @Prop({ default: '' })
  notes!: string;
}

export const GuideSchema = SchemaFactory.createForClass(Guide);
