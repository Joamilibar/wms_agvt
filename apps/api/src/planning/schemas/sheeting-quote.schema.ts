import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { QuoteInput, QuoteResult } from '../sheeting/sheeting-calc.service.js';

export type SheetingQuoteDocument = SheetingQuote & Document;

/**
 * A saved quote, with everything needed to reproduce it: the input, the
 * full result (pieces, metres, orientation, waste, cost breakdown, price)
 * and the versions it was computed with. Freezing turns it into a
 * `BomRecipe` for the product SKU; `bomRecipeId` makes that idempotent.
 */
@Schema({ timestamps: true, collection: 'sheeting_quotes', minimize: false })
export class SheetingQuote {
  @Prop({ required: true, index: true })
  number!: string;

  /** The finished product this quote is for (needed to freeze). */
  @Prop({ type: String, default: null, index: true })
  productSku!: string | null;

  @Prop({ default: '' })
  productName!: string;

  @Prop({ required: true, index: true })
  modelCode!: string;

  @Prop({ required: true })
  modelVersion!: number;

  @Prop({ required: true, index: true })
  fabricSku!: string;

  @Prop({ type: String, default: null })
  frameFabricSku!: string | null;

  @Prop({ type: Object, required: true })
  input!: QuoteInput;

  @Prop({ type: Object, required: true })
  result!: QuoteResult;

  @Prop({ required: true })
  paramsVersion!: number;

  @Prop({ type: String, enum: ['bsale', 'stale'], required: true })
  costSource!: 'bsale' | 'stale';

  @Prop({ type: Date, default: null })
  costSyncedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'BomRecipe', default: null })
  bomRecipeId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  bomRecipeVersion!: number | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ default: '' })
  setBy!: string;

  @Prop({ default: '' })
  notes!: string;
}

export const SheetingQuoteSchema = SchemaFactory.createForClass(SheetingQuote);
