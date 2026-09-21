import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DemandEvent, DemandEventDocument } from '../schemas/phase4.schemas.js';
import { mk } from '../engine/demand-engine.js';

export interface EventInput {
  name: string; from: string; to: string; categories?: string[]; skus?: string[]; uplift: number; source?: 'history' | 'manual'; isActive?: boolean; notes?: string;
}

@Injectable()
export class DemandEventsService {
  constructor(@InjectModel(DemandEvent.name) private model: Model<DemandEventDocument>) {}

  list(): Promise<DemandEventDocument[]> {
    return this.model.find().sort({ from: -1 }).exec();
  }

  create(input: EventInput): Promise<DemandEventDocument> {
    return this.model.create({ ...input, from: new Date(input.from), to: new Date(input.to), categories: input.categories ?? [], skus: input.skus ?? [] });
  }

  async update(id: string, patch: Partial<EventInput>): Promise<DemandEventDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Evento no encontrado');
    const { from, to, ...rest } = patch;
    // Only the keys that came in: the DTO carries every optional field as undefined.
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) doc.set(k, v);
    if (from) doc.from = new Date(from);
    if (to) doc.to = new Date(to);
    return doc.save();
  }

  async remove(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id }).exec();
  }

  /**
   * Per SKU, the multiplier of each concrete month in the coming year
   * ('2026-11' → 1.5). Events overlapping in a month multiply together.
   */
  async factorsFor(items: { sku: string; category: string }[], asOf: Date, monthsAhead = 15): Promise<Map<string, Record<string, number>>> {
    const horizonEnd = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + monthsAhead, 1));
    const events = await this.model.find({ isActive: true, to: { $gte: asOf }, from: { $lte: horizonEnd } }).exec();
    const out = new Map<string, Record<string, number>>();
    if (events.length === 0) return out;
    const monthsOf = (from: Date, to: Date) => {
      const keys: string[] = [];
      for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) keys.push(mk(d));
      return keys;
    };
    for (const it of items) {
      for (const e of events) {
        const matches = (e.skus.length && e.skus.includes(it.sku)) || (e.categories.length && e.categories.includes(it.category)) || (!e.skus.length && !e.categories.length);
        if (!matches) continue;
        const f = out.get(it.sku) ?? {};
        for (const m of monthsOf(e.from, e.to)) f[m] = (f[m] ?? 1) * e.uplift;
        out.set(it.sku, f);
      }
    }
    return out;
  }
}
