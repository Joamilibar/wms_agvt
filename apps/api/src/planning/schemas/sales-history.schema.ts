import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SalesHistoryDocument = SalesHistory & Document;

export const CHANNELS = ['retail', 'project'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * One sold line, as the demand engine needs it: dated, classified by channel,
 * with credit notes tied to the invoice they cancel and packs exploded into
 * their components.
 *
 * This is the whole sales history from BSale, not the WMS's own `SalesRecord`
 * (which only knows about pickings). The two are reconciled, never merged.
 *
 * Why a line per component of a pack: a bedding set sells 154 top sheets a
 * year through packs and 20 directly. Without explosion the top sheet looks
 * like a class C item and the set breaks on it.
 */
@Schema({ timestamps: true, collection: 'sales_history' })
export class SalesHistory {
  /** BSale document id. */
  @Prop({ required: true, index: true })
  bsaleDocId!: number;

  /** `<docTypeId>#<number>`, human key for the document. */
  @Prop({ required: true, index: true })
  docKey!: string;

  @Prop({ required: true })
  docTypeId!: number;

  @Prop({ required: true })
  docType!: string;

  @Prop({ required: true })
  isCreditNote!: boolean;

  /** BSale detail line id. With `fromPackSku` and `sku` it identifies an exploded component line. */
  @Prop({ required: true })
  lineId!: number;

  @Prop({ type: String, default: null })
  fromPackSku!: string | null;

  /** Emission date of the document. */
  @Prop({ required: true, type: Date, index: true })
  date!: Date;

  /**
   * Month the line counts in, `YYYY-MM`. Equal to the emission month except
   * for a credit note tied to an invoice inside the window, which counts in
   * the invoice's month: it is a cancellation, not a return.
   */
  @Prop({ required: true, index: true })
  month!: string;

  @Prop({ required: true })
  officeId!: string;

  @Prop({ required: true, index: true })
  warehouse!: string;

  @Prop({ required: true, index: true })
  sku!: string;

  @Prop({ type: String, default: null })
  variantId!: string | null;

  @Prop({ default: '' })
  productName!: string;

  /** Negative on credit notes. Component lines carry qty × qtyPerPack. */
  @Prop({ required: true })
  qty!: number;

  /** Net amount of the line in CLP, negative on credit notes. Component lines share the pack's net by qty. */
  @Prop({ required: true, default: 0 })
  net!: number;

  @Prop({ type: String, default: null })
  customerRut!: string | null;

  @Prop({ default: false })
  customerIsCompany!: boolean;

  @Prop({ default: '' })
  customerName!: string;

  /** Sum of |qty| over the whole document. The project rule reads it. */
  @Prop({ required: true, default: 0 })
  docUnits!: number;

  @Prop({ type: String, enum: CHANNELS, required: true, index: true })
  channel!: Channel;

  /** Set when someone reclassified the document by hand; `channel` already reflects it. */
  @Prop({ type: String, enum: CHANNELS, default: null })
  channelOverride!: Channel | null;

  @Prop({ default: '' })
  channelReason!: string;

  /** For a credit note: the BSale id of the document it cancels, via /returns. */
  @Prop({ type: Number, default: null })
  refDocId!: number | null;

  /** Retail document at or above the P99 of units: counts in the mean, not in the deviation. */
  @Prop({ default: false })
  isOutlier!: boolean;

  /** Service or free-text line; kept for audit, excluded from demand. */
  @Prop({ default: false })
  isService!: boolean;
}

export const SalesHistorySchema = SchemaFactory.createForClass(SalesHistory);

// A pack line explodes into one row per component, all sharing lineId and
// fromPackSku: the component sku is part of the key.
SalesHistorySchema.index({ bsaleDocId: 1, lineId: 1, fromPackSku: 1, sku: 1 }, { unique: true });
SalesHistorySchema.index({ sku: 1, channel: 1, month: 1 });
SalesHistorySchema.index({ warehouse: 1, sku: 1, month: 1 });
