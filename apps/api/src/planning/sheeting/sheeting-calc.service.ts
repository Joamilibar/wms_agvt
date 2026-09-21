import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { WorkshopRate, WorkshopRateDocument } from '../schemas/workshop-rate.schema.js';
import { FabricSpec } from '../schemas/fabric-spec.schema.js';
import { SheetingModel } from '../schemas/sheeting-model.schema.js';
import { PlanningParamsService } from '../masters/planning-params.service.js';
import { SheetingMastersService } from './sheeting-masters.service.js';
import { evaluatePanels, findGeometryProblems, panelVars, CutPiece } from './geometry.js';
import { nestPieces, requiredWidthCm, NestedPiece } from './nesting.js';

export interface QuoteInput {
  modelCode: string;
  modelVersion?: number;
  fabricSku: string;
  /** Quote measures in cm: `A`, `L`, and `H` for fitted sheets. */
  measures: Record<string, number>;
  qty: number;
  workshop: string;
  channel: string;
  /** Size label the workshop's price list uses (`Queen`); optional. */
  sizeLabel?: string | null;
  cutBatchUnits?: number;
}

export type CostSource = 'bsale' | 'stale';

export interface FabricCost {
  sku: string;
  pricePerLinearMetre: number;
  /** `bsale` = synced from BSale within the freshness window; `stale` = older or WMS-estimated. */
  costSource: CostSource;
  costSyncedAt: Date | null;
  /** Assumed unit of BSale's average cost for fabric. PENDING verification (blocker 5). */
  unit: 'ml';
}

export interface QuoteResult {
  model: { code: string; version: number; name: string; family: string };
  fabric: { sku: string; name: string; rollWidthCm: number; usableWidthCm: number; directional: boolean };
  measures: Record<string, number>;
  qty: number;
  workshop: string;
  channel: string;
  sizeLabel: string | null;
  pieces: (CutPiece & { orientation: string; piecesAcross: number; linearMetresPerUnit: number })[];
  consumption: {
    linearMetresPerUnit: number;
    linearMetresTotal: number;
    cuttingScrapPct: number;
    linearMetresWithScrapPerUnit: number;
    linearMetresWithScrapTotal: number;
    netAreaM2PerUnit: number;
    rollAreaM2PerUnit: number;
    wastePct: number;
    cutBatchUnits: number;
  };
  fabricCost: FabricCost;
  cost: { fabric: number; labour: number; packaging: number; freight: number; supplies: number; total: number; totalQty: number };
  /** The sheet's method — net area × $/m² — kept only to explain the difference. */
  theoretical: { netAreaM2: number; pricePerM2: number; fabric: number; deltaPct: number };
  price: { marginFactor: number; netPvp: number; grossPvp: number; vatRate: number };
  supplies: { sku: string; name: string; qty: number; uom: string; unitCost: number | null; cost: number }[];
  labourRate: { rate: number; sizeLabel: string | null; version: number };
  paramsVersion: number;
  warnings: string[];
}

/**
 * Orchestrates one quote: resolves model and fabric, evaluates the panels,
 * nests each one, applies cutting scrap, prices the fabric from the lots
 * BSale valued, resolves the workshop rate, adds packaging, freight and
 * supplies, applies the channel margin and returns the whole breakdown —
 * a total without its parts cannot be argued with the workshop.
 *
 * Nothing here knows a family: a model is its panels. Nothing here knows
 * a roll width: it comes from the fabric.
 */
@Injectable()
export class SheetingCalcService {
  constructor(
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectModel(WorkshopRate.name) private rateModel: Model<WorkshopRateDocument>,
    private masters: SheetingMastersService,
    private params: PlanningParamsService,
  ) {}

  async quote(input: QuoteInput): Promise<QuoteResult> {
    const [model, fabric, p] = await Promise.all([
      this.masters.model(input.modelCode, input.modelVersion),
      this.masters.fabric(input.fabricSku),
      this.params.current(),
    ]);
    const warnings: string[] = [];

    // 1 · geometry
    const vars = { ...model.vars, ...input.measures };
    const missing = panelVars(model.panels).filter((v) => !(v in vars));
    if (missing.length) throw new BadRequestException({ message: `Faltan medidas: ${missing.join(', ')}`, error: 'Bad Request', details: { code: 'MISSING_MEASURES', missing } });
    const problems = findGeometryProblems(model.panels, vars);
    if (problems.length) throw new BadRequestException({ message: `Geometría imposible con estas medidas: ${problems.map((x) => `${x.role} ${x.axis} = ${x.valueCm} cm`).join('; ')}`, error: 'Bad Request', details: { code: 'IMPOSSIBLE_GEOMETRY', problems } });
    for (const [k, r] of Object.entries(model.validRange ?? {})) {
      const v = vars[k];
      if (v !== undefined && (v < r.min || v > r.max)) warnings.push(`OUT_OF_RANGE:${k}`);
    }
    const pieces = evaluatePanels(model.panels, vars);

    // 2 · nesting
    const usableWidthCm = fabric.rollWidthCm - 2 * fabric.selvageCm;
    const cutBatchUnits = input.cutBatchUnits ?? model.cutBatchUnits ?? p.defaultCutBatchUnits;
    const nested = nestPieces(pieces, usableWidthCm, { directional: fabric.directional, batchUnits: cutBatchUnits, rollWidthCm: fabric.rollWidthCm });
    if ('code' in nested) {
      const alternatives = await this.fabricsThatFit(pieces, fabric.directional);
      throw new BadRequestException({
        message: `La pieza "${nested.role}" necesita ${nested.requiredWidthCm} cm de ancho útil y ${fabric.name || fabric.sku} da ${nested.availableWidthCm}`,
        error: 'Bad Request',
        details: { code: 'FABRIC_TOO_NARROW', role: nested.role, requiredWidthCm: nested.requiredWidthCm, availableWidthCm: nested.availableWidthCm, alternatives },
      });
    }
    if (nested.wastePct > 0.25) warnings.push('WASTE_ABOVE_25');

    // 3 · fabric cost, from what BSale valued
    const fabricCost = await this.fabricCost(fabric, p.fabricCostStaleDays);
    if (fabricCost.costSource === 'stale') warnings.push('FABRIC_COST_STALE');
    const cuttingScrapPct = p.cuttingScrapPct;
    const mlPerUnit = nested.linearMetresPerUnit;
    const mlWithScrap = round4(mlPerUnit * (1 + cuttingScrapPct));
    const fabricClp = Math.round(mlWithScrap * fabricCost.pricePerLinearMetre);

    // 4 · labour: never zero by default
    const sizeLabel = input.sizeLabel ?? null;
    const rate = await this.resolveRate(input.workshop, model.code, sizeLabel);
    if (!rate) {
      throw new BadRequestException({
        message: `El taller ${input.workshop} no tiene tarifa para ${model.code}${sizeLabel ? ` (${sizeLabel})` : ''}`,
        error: 'Bad Request',
        details: { code: 'NO_WORKSHOP_RATE', workshop: input.workshop, modelCode: model.code, sizeLabel },
      });
    }

    // 5 · supplies, packaging, freight
    const supplies = await this.suppliesCost(model);
    if (supplies.some((s) => s.unitCost === null)) warnings.push('SUPPLY_COST_MISSING');
    const suppliesClp = Math.round(supplies.reduce((s, x) => s + x.cost, 0));
    const packaging = Math.round(model.packagingClp ?? 0);
    const freight = Math.round(model.freightClp ?? 0);
    const total = fabricClp + rate.rate + packaging + freight + suppliesClp;

    // 6 · the sheet's number, for comparison only
    const pricePerM2 = fabricCost.pricePerLinearMetre / (fabric.rollWidthCm / 100);
    const theoreticalFabric = Math.round(nested.netAreaM2PerUnit * pricePerM2);

    // 7 · price
    const marginFactor = p.marginByChannel?.[input.channel] ?? p.marginByChannel?.tienda ?? 1;
    if (!(input.channel in (p.marginByChannel ?? {}))) warnings.push(`NO_MARGIN_FOR_CHANNEL:${input.channel}`);
    const netPvp = Math.round(total * marginFactor);

    const byRole = new Map(nested.pieces.map((x) => [x.role, x]));
    return {
      model: { code: model.code, version: model.version, name: model.name, family: model.family },
      fabric: { sku: fabric.sku, name: fabric.name, rollWidthCm: fabric.rollWidthCm, usableWidthCm, directional: fabric.directional },
      measures: input.measures, qty: input.qty, workshop: input.workshop, channel: input.channel, sizeLabel,
      pieces: pieces.map((pc) => {
        const n = byRole.get(pc.role) as NestedPiece;
        return { ...pc, orientation: n.nesting.orientation, piecesAcross: n.nesting.piecesAcross, linearMetresPerUnit: n.linearMetresPerUnit };
      }),
      consumption: {
        linearMetresPerUnit: mlPerUnit, linearMetresTotal: round4(mlPerUnit * input.qty), cuttingScrapPct,
        linearMetresWithScrapPerUnit: mlWithScrap, linearMetresWithScrapTotal: round4(mlWithScrap * input.qty),
        netAreaM2PerUnit: nested.netAreaM2PerUnit, rollAreaM2PerUnit: nested.rollAreaM2PerUnit, wastePct: nested.wastePct, cutBatchUnits,
      },
      fabricCost,
      cost: { fabric: fabricClp, labour: rate.rate, packaging, freight, supplies: suppliesClp, total, totalQty: total * input.qty },
      theoretical: { netAreaM2: nested.netAreaM2PerUnit, pricePerM2: Math.round(pricePerM2), fabric: theoreticalFabric, deltaPct: theoreticalFabric > 0 ? round4(fabricClp / theoreticalFabric - 1) : 0 },
      price: { marginFactor, netPvp, grossPvp: Math.round(netPvp * (1 + p.vatRate)), vatRate: p.vatRate },
      supplies,
      labourRate: { rate: rate.rate, sizeLabel: rate.sizeLabel, version: rate.version },
      paramsVersion: p.version,
      warnings,
    };
  }

  /**
   * Price per linear metre from the lots BSale valued (`costSyncedAt`), the
   * freshest first. A cost older than the window, or one the WMS estimated
   * itself, is `stale` — reported, never silently zero.
   */
  async fabricCost(fabric: FabricSpec, staleDays: number): Promise<FabricCost> {
    const lots = await this.stockModel.find({ sku: fabric.sku, isActive: true, unitCost: { $gt: 0 } }, { unitCost: 1, costSyncedAt: 1, entryDate: 1 }).exec();
    if (lots.length === 0) {
      throw new BadRequestException({ message: `${fabric.name || fabric.sku} no tiene costo: sincroniza costos desde BSale`, error: 'Bad Request', details: { code: 'NO_FABRIC_COST', sku: fabric.sku } });
    }
    const synced = lots.filter((l) => l.costSyncedAt).sort((a, b) => b.costSyncedAt!.getTime() - a.costSyncedAt!.getTime());
    const pick = synced[0] ?? lots.sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())[0];
    const costSyncedAt = pick.costSyncedAt ?? null;
    const fresh = costSyncedAt !== null && Date.now() - costSyncedAt.getTime() <= staleDays * 86400000;
    return { sku: fabric.sku, pricePerLinearMetre: fabricPricePerLinearMetre(pick.unitCost, fabric), costSource: fresh ? 'bsale' : 'stale', costSyncedAt, unit: 'ml' };
  }

  /** Exact size first, then the model-wide rate, valid on the date; else null. */
  async resolveRate(workshop: string, modelCode: string, sizeLabel: string | null, at = new Date()): Promise<WorkshopRateDocument | null> {
    const valid = { workshop, modelCode, isActive: true, validFrom: { $lte: at }, $or: [{ validTo: null }, { validTo: { $gte: at } }] };
    if (sizeLabel) {
      const exact = await this.rateModel.findOne({ ...valid, sizeLabel }).sort({ version: -1 }).exec();
      if (exact) return exact;
    }
    return this.rateModel.findOne({ ...valid, sizeLabel: null }).sort({ version: -1 }).exec();
  }

  private async suppliesCost(model: SheetingModel) {
    const out: QuoteResult['supplies'] = [];
    for (const s of model.supplies ?? []) {
      const lot = await this.stockModel.findOne({ sku: s.sku, isActive: true, unitCost: { $gt: 0 } }).sort({ costSyncedAt: -1, entryDate: -1 }).exec();
      const unitCost = lot?.unitCost ?? null;
      out.push({ sku: s.sku, name: s.name, qty: s.qty, uom: s.uom, unitCost, cost: Math.round((unitCost ?? 0) * s.qty) });
    }
    return out;
  }

  /** Active fabrics whose usable width takes every piece, for the screen to offer when one does not. */
  async fabricsThatFit(pieces: CutPiece[], directionalOnly: boolean): Promise<{ sku: string; name: string; rollWidthCm: number }[]> {
    const fabrics = await this.masters.fabrics();
    return fabrics
      .filter((f) => {
        const usable = f.rollWidthCm - 2 * f.selvageCm;
        return pieces.every((pc) => requiredWidthCm(pc.widthCm, pc.lengthCm, directionalOnly || f.directional) <= usable);
      })
      .map((f) => ({ sku: f.sku, name: f.name, rollWidthCm: f.rollWidthCm }));
  }
}

/**
 * BSale's `averageCost` for a fabric is assumed to be per LINEAR metre; the
 * 800TC and 1600TC values match the sheet's "Lineal" row exactly. If a
 * fabric were costed per m², the conversion is `× rollWidthCm / 100` and it
 * belongs here and nowhere else (blocker 5).
 */
export function fabricPricePerLinearMetre(unitCost: number, _fabric: Pick<FabricSpec, 'rollWidthCm'>): number {
  void _fabric;
  return unitCost;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
