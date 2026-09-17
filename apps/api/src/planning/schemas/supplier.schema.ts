import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupplierDocument = Supplier & Document;

export const MOQ_SCOPES = ['sku', 'family', 'order'] as const;
export type MoqScope = (typeof MOQ_SCOPES)[number];

/**
 * A supplier's default terms. A planning item inherits leadTimeDays,
 * transitDays and cadenceDays from here unless it carries its own value, so
 * the 200 imported SKUs that used to have no lead time at all get one the
 * moment they are assigned a supplier.
 */
@Schema({ timestamps: true, collection: 'suppliers' })
export class Supplier {
  @Prop({ required: true, unique: true })
  name!: string;

  @Prop({ default: 'USD' })
  currency!: string;

  /** Production lead time at the supplier, in days. */
  @Prop({ required: true, min: 0, default: 30 })
  leadTimeDays!: number;

  /** Sea/air transit to the warehouse, in days. Zero for national suppliers. */
  @Prop({ required: true, min: 0, default: 0 })
  transitDays!: number;

  /** How often an order is placed. The reorder target covers LT + cadence, not LT + 30. */
  @Prop({ required: true, min: 1, default: 30 })
  cadenceDays!: number;

  /** Minimum order the supplier accepts (units), or null if there is none. */
  @Prop({ type: Number, default: null })
  containerMin!: number | null;

  @Prop({ type: String, enum: MOQ_SCOPES, default: 'sku' })
  moqScope!: MoqScope;

  /** Multiplier on FOB to reach landed cost (freight, insurance, duty). 1 = none. */
  @Prop({ required: true, min: 1, default: 1 })
  landedFactor!: number;

  @Prop({ default: '' })
  paymentTerms!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: '' })
  notes!: string;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
