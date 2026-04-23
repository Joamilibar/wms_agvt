import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StockLotDocument = StockLot & Document;

@Schema({ timestamps: true })
export class StockLot {
  @Prop({ required: true, index: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  lot!: string;

  @Prop({ required: true, type: Date, index: true })
  entryDate!: Date;

  @Prop({ type: Date, default: null })
  expiryDate!: Date | null;

  @Prop({ required: true, min: 0 })
  qty!: number;

  @Prop({ required: true, min: 0 })
  initialQty!: number;

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

  @Prop({ required: true, min: 0 })
  unitCost!: number;

  @Prop({ required: true, default: 'Central' })
  warehouse!: string;

  @Prop({ type: String, default: null })
  supplier!: string | null;

  @Prop({ type: String, default: null })
  bsaleProductId!: string | null;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;
}

export const StockLotSchema = SchemaFactory.createForClass(StockLot);

// Composite indexes for FIFO queries
StockLotSchema.index({ sku: 1, entryDate: 1 });
StockLotSchema.index({ sku: 1, warehouse: 1 });
StockLotSchema.index({ lot: 1, warehouse: 1 }, { unique: true });
