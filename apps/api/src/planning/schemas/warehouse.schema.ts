import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WarehouseDocument = Warehouse & Document;

/**
 * What a warehouse is *for*. The stock sync used to add every BSale office
 * into one number, so 141 kg of feathers in a workshop and 302 units set aside
 * in "Reservas" counted as sellable product. Each planning decision now asks
 * for the roles it cares about instead of summing everything.
 */
export const WAREHOUSE_ROLES = ['sellable', 'store', 'workshop', 'raw', 'reserved', 'project'] as const;
export type WarehouseRole = (typeof WAREHOUSE_ROLES)[number];

export const PLANNING_USES = ['purchase', 'production', 'store'] as const;
export type PlanningUse = (typeof PLANNING_USES)[number];

@Schema({ timestamps: true, collection: 'warehouses' })
export class Warehouse {
  /** The name BSale uses for the office; it is also the `warehouse` on every lot. */
  @Prop({ required: true, unique: true })
  name!: string;

  @Prop({ type: String, default: null })
  bsaleOfficeId!: string | null;

  @Prop({ type: String, enum: WAREHOUSE_ROLES, required: true })
  role!: WarehouseRole;

  /** Which decisions read this warehouse's stock. Derived from the role unless overridden. */
  @Prop({ type: [String], enum: PLANNING_USES, default: [] })
  countsFor!: PlanningUse[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: '' })
  notes!: string;
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);

/** Default uses per role, applied when a warehouse is created or its role changes. */
export const DEFAULT_USES: Record<WarehouseRole, PlanningUse[]> = {
  sellable: ['purchase', 'store'],
  store: ['purchase'],
  workshop: ['production'],
  raw: ['production'],
  reserved: [],
  project: [],
};
