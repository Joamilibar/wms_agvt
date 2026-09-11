import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CounterDocument = Counter & Document;

/**
 * One document per correlative sequence, keyed by sequence name
 * (e.g. "ORD-2026", "GD-2026"). The year is part of the key so a new year
 * starts at 1 on its own, with no reset job.
 */
@Schema({ versionKey: false, collection: 'counters' })
export class Counter {
  @Prop({ type: String, required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: Number, required: true, default: 0 })
  seq!: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
