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

  /** Unit of `qty`: pieces for product, kilos for down and feathers, metres for fabric. */
  @Prop({ type: String, enum: ['un', 'kg', 'm'], default: 'un' })
  uom!: 'un' | 'kg' | 'm';

  @Prop({ required: true, min: 0 })
  initialQty!: number;

  /**
   * Units promised to an in-progress order but not yet picked.
   * Available stock is `qty - reservedQty`; FIFO *reservation* reads the
   * available figure, FIFO *consumption* reads `qty`, because the picker
   * physically takes what is on the shelf.
   */
  @Prop({ required: true, min: 0, default: 0 })
  reservedQty!: number;

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

  /** Last time `unitCost` was taken from BSale's average cost (null = WMS-estimated). */
  @Prop({ type: Date, default: null })
  costSyncedAt!: Date | null;

  @Prop({ required: true, default: 'Central' })
  warehouse!: string;

  @Prop({ type: String, default: null })
  supplier!: string | null;

  @Prop({ type: String, default: null })
  bsaleProductId!: string | null;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;
}

export const StockLotSchema = SchemaFactory.createForClass(StockLot);

// Composite indexes for FIFO queries
StockLotSchema.index({ sku: 1, entryDate: 1 });
StockLotSchema.index({ sku: 1, warehouse: 1 });
// Partial: only *active* lots must have a unique {lot, warehouse}. Archived lots
// (isActive:false) are kept for traceability and must not block a re-sync that
// regenerates the same deterministic BSale lot key.
// NOTE: on a database created before this change, drop the old index once:
//   db.stocklots.dropIndex('lot_1_warehouse_1')
StockLotSchema.index(
  { lot: 1, warehouse: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
