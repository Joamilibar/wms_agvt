import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../../orders/schemas/order.schema.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { PlanningRun, PlanningRunDocument } from '../schemas/planning-run.schema.js';
import { PurchaseOrder, PurchaseOrderDocument } from '../schemas/purchase-order.schema.js';
import { ProductionOrder, ProductionOrderDocument } from '../schemas/production-order.schema.js';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { ProjectDemand, ProjectDemandDocument } from '../schemas/phase4.schemas.js';
import { ForecastAccuracyService } from './accuracy.service.js';
import { ProductionService } from '../production/production.service.js';
import { ProjectsService } from './projects.service.js';

export interface Alert {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  sku?: string;
  ref?: string;
}

/**
 * How the module is doing, from data it already has: forecast accuracy,
 * breaches, overstock, fill rate, supplier punctuality, production, and
 * the list of things that need a person today.
 */
@Injectable()
export class KpisService {
  constructor(
    @InjectModel(PlanningRun.name) private runModel: Model<PlanningRunDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(ProductionOrder.name) private opModel: Model<ProductionOrderDocument>,
    @InjectModel(PlanningItem.name) private itemModel: Model<PlanningItemDocument>,
    @InjectModel(ProjectDemand.name) private projectModel: Model<ProjectDemandDocument>,
    private accuracy: ForecastAccuracyService,
    private production: ProductionService,
    private projects: ProjectsService,
  ) {}

  async kpis() {
    const run = await this.runModel.findOne({ status: 'approved' }).sort({ createdAt: -1 }).exec() ?? await this.runModel.findOne().sort({ createdAt: -1 }).exec();
    const results = run?.results ?? [];
    const since = new Date(Date.now() - 30 * 86400000);

    // Cost per SKU to value overstock and dead stock.
    const costs = new Map((await this.stockModel.aggregate<{ _id: string; cost: number }>([
      { $match: { isActive: true, unitCost: { $gt: 0 } } }, { $group: { _id: '$sku', cost: { $avg: '$unitCost' } } },
    ]).exec()).map((c) => [c._id, c.cost]));
    // Null, not 0, when no lot of those SKUs carries a cost: an unknown value must not read as nothing.
    const value = (rows: typeof results, units: (r: typeof results[number]) => number) =>
      rows.some((r) => costs.has(r.sku)) ? Math.round(rows.reduce((s, r) => s + units(r) * (costs.get(r.sku) ?? 0), 0)) : null;

    const breachesAB = results.filter((r) => r.state === 'QUIEBRE' && (r.abc === 'A' || r.abc === 'B'));
    const overstock = results.filter((r) => r.state === 'SOBRE_STOCK');
    const dead = results.filter((r) => r.state === 'SIN_VENTA' && r.available > 0);

    const completed = await this.orderModel.find({ status: 'completed', completedAt: { $gte: since }, destinationType: 'client' }, { items: 1 }).exec();
    let requested = 0, picked = 0;
    for (const o of completed) for (const i of o.items) { requested += i.requestedQty; picked += Math.min(i.pickedQty ?? 0, i.requestedQty); }

    const received = await this.poModel.find({ status: 'received' }).exec();
    let onTime = 0, late = 0;
    for (const po of received) for (const l of po.lines) {
      if (!l.eta) continue;
      const doneAt = (po as PurchaseOrderDocument & { updatedAt?: Date }).updatedAt ?? new Date();
      if (doneAt <= l.eta) onTime++; else late++;
    }

    const ops = await this.opModel.find({ status: 'completed' }).exec();
    let kgPlanned = 0, kgConsumed = 0;
    for (const op of ops) for (const m of op.materials) if (m.uom === 'kg') { kgPlanned += m.required; kgConsumed += m.consumed; }

    const metrics = await this.accuracy.metrics('abc');
    const latestTotal = [...metrics].reverse().find((m) => m.group === 'TOTAL') ?? null;

    return {
      run: run ? { number: run.number, asOf: run.asOf, status: run.status } : null,
      forecast: latestTotal ? { month: latestTotal.month, wape: latestTotal.wape, bias: latestTotal.bias, skus: latestTotal.skus } : null,
      breaches: { ab: breachesAB.length, all: results.filter((r) => r.state === 'QUIEBRE').length, abSkus: breachesAB.slice(0, 10).map((r) => ({ sku: r.sku, name: r.name, abc: r.abc })) },
      overstock: { skus: overstock.length, units: Math.round(overstock.reduce((s, r) => s + Math.max(0, r.available - r.target), 0)), value: value(overstock, (r) => Math.max(0, r.available - r.target)) },
      deadStock: { skus: dead.length, units: Math.round(dead.reduce((s, r) => s + r.available, 0)), value: value(dead, (r) => r.available) },
      fillRate: { orders: completed.length, requested, picked, pct: requested > 0 ? Math.round((picked / requested) * 1000) / 10 : null },
      supplier: { linesWithEta: onTime + late, onTimePct: onTime + late > 0 ? Math.round((onTime / (onTime + late)) * 1000) / 10 : null },
      production: { orders: ops.length, kgPlanned: Math.round(kgPlanned * 10) / 10, kgConsumed: Math.round(kgConsumed * 10) / 10 },
      adoption: await this.adoption(),
    };
  }

  /** How much of what the engine suggested was ordered as suggested. */
  private async adoption() {
    const pos = await this.poModel.find({ source: 'planning_run' }).exec();
    let lines = 0, changed = 0;
    for (const po of pos) {
      lines += po.lines.length;
      changed += (po.notes.match(/sugerido \d+/g) ?? []).length;
    }
    return { orders: pos.length, lines, changed, acceptedPct: lines > 0 ? Math.round(((lines - changed) / lines) * 1000) / 10 : null };
  }

  async alerts(): Promise<Alert[]> {
    const run = await this.runModel.findOne({ status: 'approved' }).sort({ createdAt: -1 }).exec() ?? await this.runModel.findOne().sort({ createdAt: -1 }).exec();
    const results = run?.results ?? [];
    const out: Alert[] = [];
    const now = new Date();

    for (const r of results) {
      if (r.state === 'QUIEBRE' && r.abc === 'A') out.push({ type: 'quiebre_A', severity: 'critical', sku: r.sku, message: `${r.name || r.sku}: clase A bajo la seguridad (posición ${Math.round(r.position)}, pedido ${r.rounded})`, ref: run?.number });
      if (r.monthsWithSales === 3 && r.lifecycle === 'new') out.push({ type: 'nuevo_activo', severity: 'low', sku: r.sku, message: `${r.name || r.sku}: cumple 3 meses de dato, puede pasar a activo`, ref: run?.number });
      if (r.yoy.alert && (r.abc === 'A' || r.abc === 'B')) out.push({ type: 'interanual', severity: 'medium', sku: r.sku, message: `${r.name || r.sku}: pronóstico ${r.yoy.deltaPct! > 0 ? '+' : ''}${Math.round(r.yoy.deltaPct! * 100)} % contra ${Number(r.yoy.month.slice(0, 4)) - 1}-${r.yoy.month.slice(5)}`, ref: run?.number });
    }

    const openPos = await this.poModel.find({ status: { $in: ['approved', 'sent', 'partial'] } }).exec();
    for (const po of openPos) for (const l of po.lines) {
      if (l.qtyOrdered <= l.qtyReceived) continue;
      if (l.eta && l.eta < now) out.push({ type: 'eta_vencida', severity: 'high', sku: l.sku, message: `${po.number} ${l.name || l.sku}: ETA ${l.eta.toISOString().slice(0, 10)} vencida sin recepción`, ref: po.number });
      if (!l.eta) out.push({ type: 'sin_eta', severity: 'low', sku: l.sku, message: `${po.number} ${l.name || l.sku}: línea en tránsito sin fecha estimada`, ref: po.number });
    }

    const missing = await this.itemModel.countDocuments({ origin: 'imported', supplierId: null }).exec();
    if (missing) out.push({ type: 'sin_proveedor', severity: 'high', message: `${missing} importados sin proveedor: su punto de reorden es solo la seguridad` });

    try {
      const plan = await this.production.plan();
      for (const m of plan.materials) if (m.shortage > 0 && m.uom === 'kg') out.push({ type: 'materia_prima', severity: 'high', sku: m.sku, message: `${m.name}: faltan ${Math.round(m.shortage * 10) / 10} kg para lo que la corrida pide producir` });
      if (plan.missingRecipes.length) out.push({ type: 'sin_receta', severity: 'medium', message: `${plan.missingRecipes.length} nacionales a producir sin receta` });
    } catch { /* no run yet */ }

    const cov = await this.projects.coverage();
    const projects = await this.projectModel.find({ status: { $in: ['quote', 'confirmed'] } }).exec();
    for (const p of projects) {
      const lines = cov[String(p._id)] ?? [];
      const short = lines.filter((l) => !l.covered);
      if (short.length) out.push({ type: 'proyecto_sin_cobertura', severity: p.status === 'confirmed' ? 'critical' : 'medium', message: `${p.number} ${p.customer}: ${short.length} línea(s) sin stock ni pedido${p.requiredDate ? ` para ${p.requiredDate.toISOString().slice(0, 10)}` : ''}`, ref: p.number });
    }

    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }
}
