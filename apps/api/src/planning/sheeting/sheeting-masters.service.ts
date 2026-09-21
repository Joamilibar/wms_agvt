import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FabricSpec, FabricSpecDocument } from '../schemas/fabric-spec.schema.js';
import { SheetingModel, SheetingModelDocument } from '../schemas/sheeting-model.schema.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { findGeometryProblems, formatDimension, panelVars, PanelSpec } from './geometry.js';
import { REFERENCE_FABRICS, REFERENCE_MODELS } from './reference-models.js';

export interface FabricInput {
  sku: string; name?: string; rollWidthCm: number; selvageCm?: number; directional?: boolean; quality?: string; bsaleVariantId?: string | null; isActive?: boolean; notes?: string;
}

export interface ModelInput {
  code: string; name: string; family: SheetingModel['family']; vars?: Record<string, number>; panels: PanelSpec[];
  blocks?: SheetingModel['blocks']; hems?: SheetingModel['hems']; cutBatchUnits?: number; supplies?: { sku: string; name?: string; qty: number; uom: 'un' | 'kg' | 'm' }[];
  validRange?: SheetingModel['validRange']; sampleVars?: Record<string, number>; packagingClp?: number; freightClp?: number; notes?: string;
}

/**
 * Fabrics and models: the masters the calculation reads. A model is
 * versioned like `BomRecipe` — saving writes the next version and retires
 * the previous one; nothing is edited in place, so a quote's
 * `modelVersion` always means the same geometry.
 */
@Injectable()
export class SheetingMastersService {
  private readonly logger = new Logger(SheetingMastersService.name);

  constructor(
    @InjectModel(FabricSpec.name) private fabricModel: Model<FabricSpecDocument>,
    @InjectModel(SheetingModel.name) private modelModel: Model<SheetingModelDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
  ) {}

  // ── fabrics ────────────────────────────────────────────────────────────────

  fabrics(all = false): Promise<FabricSpecDocument[]> {
    return this.fabricModel.find(all ? {} : { isActive: true }).sort({ quality: 1, rollWidthCm: -1 }).exec();
  }

  async fabric(sku: string): Promise<FabricSpecDocument> {
    const f = await this.fabricModel.findOne({ sku }).exec();
    if (!f) throw new NotFoundException(`Tela ${sku} sin ficha`);
    return f;
  }

  async upsertFabric(input: FabricInput): Promise<FabricSpecDocument> {
    const bsaleVariantId = input.bsaleVariantId !== undefined ? input.bsaleVariantId : await this.variantIdFor(input.sku);
    return this.fabricModel.findOneAndUpdate(
      { sku: input.sku },
      { $set: { ...input, bsaleVariantId, selvageCm: input.selvageCm ?? 1, directional: input.directional ?? false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  private async variantIdFor(sku: string): Promise<string | null> {
    const lot = await this.stockModel.findOne({ sku, bsaleProductId: { $ne: null } }, { bsaleProductId: 1 }).exec();
    return lot?.bsaleProductId ?? null;
  }

  // ── models ─────────────────────────────────────────────────────────────────

  models(all = false): Promise<SheetingModelDocument[]> {
    return this.modelModel.find(all ? {} : { isActive: true }).sort({ family: 1, code: 1, version: -1 }).exec();
  }

  async model(code: string, version?: number): Promise<SheetingModelDocument> {
    const m = version
      ? await this.modelModel.findOne({ code, version }).exec()
      : await this.modelModel.findOne({ code, isActive: true }).exec();
    if (!m) throw new NotFoundException(`Modelo ${code}${version ? ` v${version}` : ''} no encontrado`);
    return m;
  }

  /**
   * Validates and writes the next version of a model. Every dimension has
   * to be positive on the sample measures and on the corners of the valid
   * range: a 30 cm frame on a 50 cm case is refused here, not in production.
   */
  async saveModel(input: ModelInput, setBy: string): Promise<SheetingModelDocument> {
    if (!input.panels?.length) throw new BadRequestException('El modelo necesita al menos un panel');
    const vars = input.vars ?? {};
    const sample = input.sampleVars ?? {};
    const needed = panelVars(input.panels).filter((v) => !(v in vars) && !(v in sample));
    if (needed.length) throw new BadRequestException(`Variables sin valor de muestra ni de modelo: ${needed.join(', ')}`);

    const problems = this.problemsOver(input.panels, vars, sample, input.validRange ?? {});
    if (problems.length) {
      throw new BadRequestException({ message: `Geometría imposible: ${problems.map((p) => `${p.role} ${p.axis === 'width' ? 'ancho' : 'largo'} = ${p.valueCm} cm (${p.expression})`).join('; ')}`, error: 'Bad Request', details: problems });
    }

    const last = await this.modelModel.findOne({ code: input.code }).sort({ version: -1 }).exec();
    const version = (last?.version ?? 0) + 1;
    await this.modelModel.updateMany({ code: input.code, isActive: true }, { $set: { isActive: false } }).exec();
    const supplies = (input.supplies ?? []).map((x) => ({ ...x, name: x.name ?? '' }));
    const doc = await this.modelModel.create({ ...input, supplies, vars, sampleVars: sample, version, isActive: true, setBy });
    this.logger.log(`Modelo ${doc.code} v${doc.version} guardado por ${setBy} (${doc.panels.length} paneles)`);
    return doc;
  }

  /** Geometry problems on the sample and on every corner of the valid range. */
  problemsOver(panels: PanelSpec[], vars: Record<string, number>, sample: Record<string, number>, range: SheetingModel['validRange']) {
    const points: Record<string, number>[] = [{ ...vars, ...sample }];
    const keys = Object.keys(range);
    if (keys.length) {
      // Linear dimensions reach their extremes at the corners of the box.
      for (let mask = 0; mask < 1 << keys.length; mask++) {
        const p: Record<string, number> = { ...vars, ...sample };
        keys.forEach((k, i) => { p[k] = mask & (1 << i) ? range[k].max : range[k].min; });
        points.push(p);
      }
    }
    const seen = new Set<string>();
    const out: { role: string; axis: 'width' | 'length'; valueCm: number; expression: string; at: Record<string, number> }[] = [];
    for (const at of points) {
      for (const pr of findGeometryProblems(panels, at)) {
        const key = `${pr.role}|${pr.axis}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...pr, at: Object.fromEntries(Object.entries(at).filter(([k]) => panelVars(panels).includes(k))) });
      }
    }
    return out;
  }

  describePanels(panels: PanelSpec[]): { role: string; count: number; width: string; length: string; mitred45: boolean }[] {
    return panels.map((p) => ({ role: p.role, count: p.count, width: formatDimension(p.width), length: formatDimension(p.length), mitred45: p.mitred45 }));
  }

  // ── seed ───────────────────────────────────────────────────────────────────

  /** Loads the reference fabrics and models. Idempotent: an existing code is left alone. */
  async seed(setBy: string): Promise<{ fabrics: number; models: number; skipped: string[] }> {
    let fabrics = 0;
    for (const f of REFERENCE_FABRICS) {
      const exists = await this.fabricModel.exists({ sku: f.sku });
      if (exists) continue;
      await this.upsertFabric(f);
      fabrics++;
    }
    let models = 0;
    const skipped: string[] = [];
    for (const m of REFERENCE_MODELS) {
      if (await this.modelModel.exists({ code: m.code })) { skipped.push(m.code); continue; }
      await this.saveModel({ ...m, blocks: [], supplies: [] }, setBy);
      models++;
    }
    return { fabrics, models, skipped };
  }
}
