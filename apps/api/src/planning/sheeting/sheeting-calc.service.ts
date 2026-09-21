import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { WorkshopRateDocument } from '../schemas/workshop-rate.schema.js';
import { WorkshopRatesService } from './workshop-rates.service.js';
import { FabricSpec } from '../schemas/fabric-spec.schema.js';
import { SheetingModel } from '../schemas/sheeting-model.schema.js';
import { PlanningParamsService } from '../masters/planning-params.service.js';
import { SheetingMastersService } from './sheeting-masters.service.js';
import { evaluatePanels, findGeometryProblems, panelVars, fabricSlots, CutPiece } from './geometry.js';
import { nestPieces, requiredWidthCm, NestedPiece, NestingSummary } from './nesting.js';

export interface QuoteInput {
  modelCode: string;
  modelVersion?: number;
  fabricSku: string;
  /** Fabric for the panels in slot `marco` (a coloured frame); omitted = same as `fabricSku`. */
  frameFabricSku?: string | null;
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

export interface QuoteFabric {
  slot: string;
  sku: string;
  name: string;
  rollWidthCm: number;
  usableWidthCm: number;
  directional: boolean;
  consumption: { linearMetresPerUnit: number; linearMetresWithScrapPerUnit: number; netAreaM2PerUnit: number; rollAreaM2PerUnit: number; wastePct: number };
  cost: FabricCost;
  /** CLP per unit for this fabric, cutting scrap included. */
  fabricClp: number;
  theoreticalClp: number;
}

export interface QuoteResult {
  model: { code: string; version: number; name: string; family: string };
  /** The base fabric (slot `base`); `fabrics` has every slot. */
  fabric: { sku: string; name: string; rollWidthCm: number; usableWidthCm: number; directional: boolean };
  fabrics: QuoteFabric[];
  measures: Record<string, number>;
  qty: number;
  workshop: string;
  channel: string;
  sizeLabel: string | null;
  pieces: (CutPiece & { fabricSku: string; orientation: string; piecesAcross: number; linearMetresPerUnit: number })[];
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
  /** Cost of the base fabric; per-slot detail in `fabrics`. */
  fabricCost: FabricCost;
  cost: { fabric: number; labour: number; packaging: number; freight: number; supplies: number; total: number; totalQty: number };
  /** The sheet's method — net area × $/m² — kept only to explain the difference. */
  theoretical: { netAreaM2: number; pricePerM2: number; fabric: number; deltaPct: number };
  price: { marginFactor: number; netPvp: number; grossPvp: number; vatRate: number };
  supplies: { sku: string; name: string; qty: number; uom: string; unitCost: number | null; cost: number }[];
  labourRate: { rate: number; sizeLabel: string | null; quality: string | null; version: number };
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
    private rates: WorkshopRatesService,
    private masters: SheetingMastersService,
    private params: PlanningParamsService,
  ) {}

  async quote(input: QuoteInput): Promise<QuoteResult> {
    const [model, p] = await Promise.all([this.masters.model(input.modelCode, input.modelVersion), this.params.current()]);
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

    // 2 · one fabric per slot: the frame can be a different (coloured) fabric with its own roll and price
    const slots = fabricSlots(model.panels);
    const skuFor = (slot: string) => (slot === 'marco' && input.frameFabricSku ? input.frameFabricSku : input.fabricSku);
    const fabricBySlot = new Map<string, FabricSpec>();
    for (const slot of slots) fabricBySlot.set(slot, await this.masters.fabric(skuFor(slot)));
    const cutBatchUnits = input.cutBatchUnits ?? model.cutBatchUnits ?? p.defaultCutBatchUnits;
    const cuttingScrapPct = p.cuttingScrapPct;

    // 3 · nesting and fabric cost, per slot
    const fabrics: QuoteFabric[] = [];
    const nestedBySlot = new Map<string, NestingSummary>();
    for (const slot of slots) {
      const fabric = fabricBySlot.get(slot)!;
      const usableWidthCm = fabric.rollWidthCm - 2 * fabric.selvageCm;
      const slotPieces = pieces.filter((pc) => pc.fabricSlot === slot);
      const nested = nestPieces(slotPieces, usableWidthCm, { directional: fabric.directional, batchUnits: cutBatchUnits, rollWidthCm: fabric.rollWidthCm });
      if ('code' in nested) {
        const alternatives = await this.fabricsThatFit(slotPieces, fabric.directional);
        throw new BadRequestException({
          message: `La pieza "${nested.role}" necesita ${nested.requiredWidthCm} cm de ancho útil y ${fabric.name || fabric.sku} da ${nested.availableWidthCm}`,
          error: 'Bad Request',
          details: { code: 'FABRIC_TOO_NARROW', slot, role: nested.role, requiredWidthCm: nested.requiredWidthCm, availableWidthCm: nested.availableWidthCm, alternatives },
        });
      }
      nestedBySlot.set(slot, nested);
      const cost = await this.fabricCost(fabric, p.fabricCostStaleDays);
      if (cost.costSource === 'stale') warnings.push(`FABRIC_COST_STALE:${slot}`);
      const mlWithScrap = round4(nested.linearMetresPerUnit * (1 + cuttingScrapPct));
      const pricePerM2 = cost.pricePerLinearMetre / (fabric.rollWidthCm / 100);
      fabrics.push({
        slot, sku: fabric.sku, name: fabric.name, rollWidthCm: fabric.rollWidthCm, usableWidthCm, directional: fabric.directional,
        consumption: { linearMetresPerUnit: nested.linearMetresPerUnit, linearMetresWithScrapPerUnit: mlWithScrap, netAreaM2PerUnit: nested.netAreaM2PerUnit, rollAreaM2PerUnit: nested.rollAreaM2PerUnit, wastePct: nested.wastePct },
        cost, fabricClp: Math.round(mlWithScrap * cost.pricePerLinearMetre), theoreticalClp: Math.round(nested.netAreaM2PerUnit * pricePerM2),
      });
    }
    const base = fabrics[0];
    const baseFabric = fabricBySlot.get(base.slot)!;
    const mlPerUnit = round4(fabrics.reduce((a, f) => a + f.consumption.linearMetresPerUnit, 0));
    const mlWithScrap = round4(fabrics.reduce((a, f) => a + f.consumption.linearMetresWithScrapPerUnit, 0));
    const netArea = round4(fabrics.reduce((a, f) => a + f.consumption.netAreaM2PerUnit, 0));
    const rollArea = round4(fabrics.reduce((a, f) => a + f.consumption.rollAreaM2PerUnit, 0));
    const wastePct = rollArea > 0 ? round4(1 - netArea / rollArea) : 0;
    if (wastePct > 0.25) warnings.push('WASTE_ABOVE_25');
    const fabricClp = fabrics.reduce((a, f) => a + f.fabricClp, 0);
    const theoreticalFabric = fabrics.reduce((a, f) => a + f.theoreticalClp, 0);

    // 4 · labour: never zero by default
    const sizeLabel = input.sizeLabel ?? null;
    const rate: WorkshopRateDocument | null = await this.rates.resolve(input.workshop, model.code, sizeLabel, baseFabric.quality || null);
    if (!rate) {
      throw new BadRequestException({
        message: `El taller ${input.workshop} no tiene tarifa para ${model.code}${sizeLabel ? ` (${sizeLabel})` : ''}`,
        error: 'Bad Request',
        details: { code: 'NO_WORKSHOP_RATE', workshop: input.workshop, modelCode: model.code, sizeLabel, quality: baseFabric.quality || null },
      });
    }

    // 5 · supplies, packaging, freight
    const supplies = await this.suppliesCost(model);
    if (supplies.some((s) => s.unitCost === null)) warnings.push('SUPPLY_COST_MISSING');
    const suppliesClp = Math.round(supplies.reduce((s, x) => s + x.cost, 0));
    const packaging = Math.round(model.packagingClp ?? 0);
    const freight = Math.round(model.freightClp ?? 0);
    const total = fabricClp + rate.rate + packaging + freight + suppliesClp;

    // 7 · price
    const marginFactor = p.marginByChannel?.[input.channel] ?? p.marginByChannel?.tienda ?? 1;
    if (!(input.channel in (p.marginByChannel ?? {}))) warnings.push(`NO_MARGIN_FOR_CHANNEL:${input.channel}`);
    const netPvp = Math.round(total * marginFactor);

    const byRole = new Map([...nestedBySlot.values()].flatMap((n) => n.pieces).map((x) => [x.role, x]));
    return {
      model: { code: model.code, version: model.version, name: model.name, family: model.family },
      fabric: { sku: baseFabric.sku, name: baseFabric.name, rollWidthCm: baseFabric.rollWidthCm, usableWidthCm: base.usableWidthCm, directional: baseFabric.directional },
      fabrics,
      measures: input.measures, qty: input.qty, workshop: input.workshop, channel: input.channel, sizeLabel,
      pieces: pieces.map((pc) => {
        const n = byRole.get(pc.role) as NestedPiece;
        return { ...pc, fabricSku: fabricBySlot.get(pc.fabricSlot)!.sku, orientation: n.nesting.orientation, piecesAcross: n.nesting.piecesAcross, linearMetresPerUnit: n.linearMetresPerUnit };
      }),
      consumption: {
        linearMetresPerUnit: mlPerUnit, linearMetresTotal: round4(mlPerUnit * input.qty), cuttingScrapPct,
        linearMetresWithScrapPerUnit: mlWithScrap, linearMetresWithScrapTotal: round4(mlWithScrap * input.qty),
        netAreaM2PerUnit: netArea, rollAreaM2PerUnit: rollArea, wastePct, cutBatchUnits,
      },
      fabricCost: base.cost,
      cost: { fabric: fabricClp, labour: rate.rate, packaging, freight, supplies: suppliesClp, total, totalQty: total * input.qty },
      theoretical: { netAreaM2: netArea, pricePerM2: Math.round(base.cost.pricePerLinearMetre / (baseFabric.rollWidthCm / 100)), fabric: theoreticalFabric, deltaPct: theoreticalFabric > 0 ? round4(fabricClp / theoreticalFabric - 1) : 0 },
      price: { marginFactor, netPvp, grossPvp: Math.round(netPvp * (1 + p.vatRate)), vatRate: p.vatRate },
      supplies,
      labourRate: { rate: rate.rate, sizeLabel: rate.sizeLabel, quality: rate.quality, version: rate.version },
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
