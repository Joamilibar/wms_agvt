import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IdealStockDocument = IdealStock & Document;

/**
 * The ideal stock of a SKU in a store (D10). A manual value — the 470 the
 * spreadsheet carried — is an override with a validity window; anything
 * without one is computed from the store's own sales at each plan. The
 * source is kept so the screen can say which is which.
 */
@Schema({ timestamps: true, collection: 'ideal_stock' })
export class IdealStock {
  @Prop({ required: true, index: true })
  sku!: string;

  /** Warehouse name of the store, as BSale names it. */
  @Prop({ required: true, index: true })
  store!: string;

  @Prop({ required: true, min: 0 })
  ideal!: number;

  /** Units that must be on the floor even without sales. */
  @Prop({ required: true, min: 0, default: 0 })
  displayMin!: number;

  @Prop({ type: Date, default: null })
  validFrom!: Date | null;

  @Prop({ type: Date, default: null })
  validTo!: Date | null;

  @Prop({ default: '' })
  setBy!: string;

  @Prop({ default: '' })
  notes!: string;
}

export const IdealStockSchema = SchemaFactory.createForClass(IdealStock);
IdealStockSchema.index({ sku: 1, store: 1 }, { unique: true });
