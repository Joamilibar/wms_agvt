import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkshopRate, WorkshopRateDocument } from '../schemas/workshop-rate.schema.js';
import { WarehousesService } from '../masters/warehouses.service.js';

export interface RateInput {
  workshop: string;
  modelCode: string;
  sizeLabel?: string | null;
  quality?: string | null;
  rate: number;
  validFrom?: string;
  validTo?: string | null;
  notes?: string;
}

/**
 * The costing sheet's labour column (REV ADR, 21-09-2026), loaded as-is for
 * every active workshop until the workshops hand in their own lists:
 * top sheet 500TC $12.000 / $14.000, 800TC and 1600TC $14.000 / $16.000
 * (small sizes / Queen and up); fitted sheet $6.000 / $7.000.
 */
const SMALL = ['Single', 'Twin', 'Full'];
const LARGE = ['Queen', 'King', 'SuperKing'];
export const SHEET_RATES: { modelCode: string; quality: string | null; sizes: string[]; rate: number }[] = [
  { modelCode: 'ENCIMERA_CRUCERO', quality: '500TC', sizes: SMALL, rate: 12000 },
  { modelCode: 'ENCIMERA_CRUCERO', quality: '500TC', sizes: LARGE, rate: 14000 },
  { modelCode: 'ENCIMERA_CRUCERO', quality: '800TC', sizes: SMALL, rate: 14000 },
  { modelCode: 'ENCIMERA_CRUCERO', quality: '800TC', sizes: LARGE, rate: 16000 },
  { modelCode: 'ENCIMERA_CRUCERO', quality: '1600TC', sizes: SMALL, rate: 14000 },
  { modelCode: 'ENCIMERA_CRUCERO', quality: '1600TC', sizes: LARGE, rate: 16000 },
  { modelCode: 'BAJERA_ELASTICADA', quality: null, sizes: SMALL, rate: 6000 },
  { modelCode: 'BAJERA_ELASTICADA', quality: null, sizes: LARGE, rate: 7000 },
];

@Injectable()
export class WorkshopRatesService {
  private readonly logger = new Logger(WorkshopRatesService.name);

  constructor(
    @InjectModel(WorkshopRate.name) private model: Model<WorkshopRateDocument>,
    private warehouses: WarehousesService,
  ) {}

  list(filter: { workshop?: string; modelCode?: string; all?: boolean } = {}): Promise<WorkshopRateDocument[]> {
    const q: Record<string, unknown> = {};
    if (filter.workshop) q.workshop = filter.workshop;
    if (filter.modelCode) q.modelCode = filter.modelCode;
    if (!filter.all) q.isActive = true;
    return this.model.find(q).sort({ workshop: 1, modelCode: 1, quality: 1, sizeLabel: 1, version: -1 }).exec();
  }

  /**
   * Writes the next version for (workshop, model, size, quality) and retires
   * the previous one. The old version stays: a saved quote points at the
   * version it used.
   */
  async upsert(input: RateInput, setBy: string): Promise<WorkshopRateDocument> {
    const workshops = await this.warehouses.namesFor('production');
    const known = (await this.warehouses.findAll()).map((w) => w.name);
    if (!known.includes(input.workshop)) throw new BadRequestException(`Bodega ${input.workshop} no existe`);
    if (!workshops.includes(input.workshop)) this.logger.warn(`Tarifa para ${input.workshop}, que no cuenta como taller de producción`);
    const key = { workshop: input.workshop, modelCode: input.modelCode, sizeLabel: input.sizeLabel ?? null, quality: input.quality ?? null };
    const last = await this.model.findOne(key).sort({ version: -1 }).exec();
    await this.model.updateMany({ ...key, isActive: true }, { $set: { isActive: false } }).exec();
    return this.model.create({
      ...key, rate: input.rate, version: (last?.version ?? 0) + 1, isActive: true, setBy,
      validFrom: input.validFrom ? new Date(input.validFrom) : new Date(), validTo: input.validTo ? new Date(input.validTo) : null, notes: input.notes ?? '',
    });
  }

  /**
   * Most specific first: (size, quality) → (size, any) → (any, quality) →
   * (any, any); each must be active and valid on the date. Null = no rate.
   */
  async resolve(workshop: string, modelCode: string, sizeLabel: string | null, quality: string | null, at = new Date()): Promise<WorkshopRateDocument | null> {
    const valid = { workshop, modelCode, isActive: true, validFrom: { $lte: at }, $or: [{ validTo: null }, { validTo: { $gte: at } }] };
    const tries: { sizeLabel: string | null; quality: string | null }[] = [];
    if (sizeLabel && quality) tries.push({ sizeLabel, quality });
    if (sizeLabel) tries.push({ sizeLabel, quality: null });
    if (quality) tries.push({ sizeLabel: null, quality });
    tries.push({ sizeLabel: null, quality: null });
    for (const t of tries) {
      const hit = await this.model.findOne({ ...valid, ...t }).sort({ version: -1 }).exec();
      if (hit) return hit;
    }
    return null;
  }

  /** Loads the sheet's rates for every warehouse with role `workshop`. Idempotent per key. */
  async seed(setBy: string): Promise<{ workshops: string[]; created: number; skipped: number }> {
    const workshops = (await this.warehouses.findAll()).filter((w) => w.role === 'workshop' && w.isActive).map((w) => w.name);
    let created = 0, skipped = 0;
    for (const workshop of workshops) {
      for (const r of SHEET_RATES) {
        for (const sizeLabel of r.sizes) {
          const key = { workshop, modelCode: r.modelCode, sizeLabel, quality: r.quality };
          if (await this.model.exists(key)) { skipped++; continue; }
          await this.model.create({ ...key, rate: r.rate, version: 1, isActive: true, setBy, validFrom: new Date('2026-01-01'), validTo: null, notes: 'Hoja REV ADR (columna Costo Taller), 21-09-2026' });
          created++;
        }
      }
    }
    this.logger.log(`Workshop rates seeded: ${created} created, ${skipped} skipped, for ${workshops.join(', ')}`);
    return { workshops, created, skipped };
  }
}
