import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { PlanningRun, PlanningRunDocument } from '../schemas/planning-run.schema.js';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { Supplier, SupplierDocument } from '../schemas/supplier.schema.js';
import { SalesHistory, SalesHistoryDocument } from '../schemas/sales-history.schema.js';
import { PlanningParamsService } from '../masters/planning-params.service.js';
import { WarehousesService } from '../masters/warehouses.service.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { historyWindow } from '../history-window.js';
import { evaluateSku, classifyAbc, EngineParams, MonthPoint, SkuInput, SkuResult } from './demand-engine.js';

/** Origins the purchasing engine evaluates. Packs are exploded; services never planned. */
const PLANNED_ORIGINS = ['imported', 'national', 'raw_material', 'supply', 'unknown'] as const;
/** Origins that become a purchase order; nationals go to production (phase 3). */
const PURCHASED_ORIGINS = new Set(['imported', 'raw_material']);

@Injectable()
export class PlanningRunsService {
  private readonly logger = new Logger(PlanningRunsService.name);

  constructor(
    @InjectModel(PlanningRun.name) private runModel: Model<PlanningRunDocument>,
    @InjectModel(PlanningItem.name) private itemModel: Model<PlanningItemDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(SalesHistory.name) private salesModel: Model<SalesHistoryDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    private counters: CountersService,
    private params: PlanningParamsService,
    private warehouses: WarehousesService,
    private purchaseOrders: PurchaseOrdersService,
  ) {}

  // ── run ────────────────────────────────────────────────────────────────────

  async run(userId: string | null, notes = ''): Promise<PlanningRunDocument> {
    const asOf = new Date();
    const window = historyWindow(asOf);
    const p = await this.params.current();
    const purchaseWarehouses = await this.warehouses.namesFor('purchase');
    if (purchaseWarehouses.length === 0) throw new BadRequestException('Ninguna bodega cuenta para compras; revisa los roles');

    // Everything the engine needs, in four queries.
    const [items, suppliers, history, stock] = await Promise.all([
      this.itemModel.find({ origin: { $in: [...PLANNED_ORIGINS] } }).exec(),
      this.supplierModel.find().exec(),
      this.salesModel.aggregate<{ _id: { sku: string; month: string }; qty: number; qtyNoOutlier: number; net: number }>([
        { $match: { channel: 'retail', isService: false, month: { $gte: window.fromMonth, $lte: window.toMonth } } },
        { $group: {
          _id: { sku: '$sku', month: '$month' },
          qty: { $sum: '$qty' },
          qtyNoOutlier: { $sum: { $cond: ['$isOutlier', 0, '$qty'] } },
          net: { $sum: '$net' },
        } },
      ]).exec(),
      this.stockModel.aggregate<{ _id: string; available: number }>([
        { $match: { isActive: true, warehouse: { $in: purchaseWarehouses } } },
        { $group: { _id: '$sku', available: { $sum: { $subtract: ['$qty', '$reservedQty'] } } } },
      ]).exec(),
    ]);
    const transit = await this.purchaseOrders.inTransit();

    const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));
    const historyBySku = new Map<string, MonthPoint[]>();
    const netBySku = new Map<string, number>();
    for (const h of history) {
      const list = historyBySku.get(h._id.sku) ?? [];
      list.push({ month: h._id.month, qty: h.qty, qtyNoOutlier: h.qtyNoOutlier, net: h.net });
      historyBySku.set(h._id.sku, list);
      netBySku.set(h._id.sku, (netBySku.get(h._id.sku) ?? 0) + h.net);
    }
    for (const it of items) if (!netBySku.has(it.sku)) netBySku.set(it.sku, 0);
    const abc = classifyAbc(netBySku);
    const availableBySku = new Map(stock.map((s) => [s._id, s.available]));

    const engineParams: EngineParams = {
      monthKeys: window.monthKeys,
      baseWeight12m: p.baseWeight12m, growthDefault: p.growthDefault, growthByCategory: p.growthByCategory,
      seasonalFactors: p.seasonalFactors ?? {}, ssMonthsImported: p.ssMonthsImported, ssMonthsNational: p.ssMonthsNational,
      zByClass: p.zByClass, reviewDays: p.reviewDays, nationalLeadTimeDays: p.nationalLeadTimeDays,
      moqMaxCoverageMonths: p.moqMaxCoverageMonths, overstockExtraMonths: p.overstockExtraMonths,
      phaseOutMonths: p.phaseOutMonths, newSkuMonths: p.newSkuMonths, yoyAlertPct: p.yoyAlertPct,
    };

    const results: PlanningRun['results'] = [];
    for (const it of items) {
      const supplier = it.supplierId ? supplierById.get(String(it.supplierId)) ?? null : null;
      const input: SkuInput = {
        sku: it.sku, origin: it.origin, category: it.category, lifecycle: it.lifecycle, launchDate: it.launchDate,
        leadTimeDays: it.leadTimeDays ?? supplier?.leadTimeDays ?? null,
        transitDays: it.transitDays ?? supplier?.transitDays ?? null,
        cadenceDays: supplier?.cadenceDays ?? null,
        moq: it.moq, orderMultiple: it.orderMultiple, abc: abc.get(it.sku) ?? 'C',
        history: historyBySku.get(it.sku) ?? [],
        available: availableBySku.get(it.sku) ?? 0,
        inTransit: (transit.get(it.sku) ?? []).map((t) => ({ qty: t.qty, eta: t.eta })),
        asOf,
      };
      const r = evaluateSku(input, engineParams);
      results.push({
        ...r, name: it.name, category: it.category, origin: it.origin,
        supplierName: supplier?.name ?? null, supplierId: supplier ? String(supplier._id) : null,
        moq: it.moq, unitCost: it.fobCost,
      });
    }

    const summary: Record<string, number> = { skus: results.length };
    for (const r of results) summary[r.state] = (summary[r.state] ?? 0) + 1;
    summary.suggestedUnits = Math.round(results.reduce((s, r) => s + r.rounded, 0));
    summary.moqFlags = results.filter((r) => r.moqExceedsHorizon).length;
    summary.yoyAlerts = results.filter((r) => r.yoy.alert).length;
    summary.missingLeadTime = results.filter((r) => r.reasons.some((x) => x.startsWith('Sin lead time'))).length;

    const year = asOf.getFullYear();
    const seq = await this.counters.next(`PL-${year}`);
    const run = await this.runModel.create({
      number: `PL-${year}-${String(seq).padStart(3, '0')}`,
      status: 'draft', asOf, fromMonth: window.fromMonth, toMonth: window.toMonth, paramsVersion: p.version,
      purchaseWarehouses, summary, results, createdBy: userId ? new Types.ObjectId(userId) : null, notes,
    });
    this.logger.log(`Planning run ${run.number}: ${results.length} SKUs, ${summary.QUIEBRE ?? 0} quiebre, ${summary.REPONER ?? 0} reponer, ${summary.suggestedUnits} u. sugeridas`);
    return run;
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  list(limit = 20) {
    return this.runModel.find({}, { results: 0 }).sort({ createdAt: -1 }).limit(limit).exec();
  }

  async findById(id: string): Promise<PlanningRunDocument> {
    const run = await this.runModel.findById(id).exec();
    if (!run) throw new NotFoundException('Corrida no encontrada');
    return run;
  }

  async latest(): Promise<PlanningRunDocument | null> {
    return this.runModel.findOne().sort({ createdAt: -1 }).exec();
  }

  /** Results filtered for the board; the run header without the full array. */
  async results(id: string, q: { state?: string; origin?: string; supplierId?: string; abc?: string; search?: string; onlySuggested?: boolean }) {
    const run = await this.findById(id);
    const s = q.search?.toLowerCase();
    const rows = run.results.filter((r) =>
      (!q.state || r.state === q.state) &&
      (!q.origin || r.origin === q.origin) &&
      (!q.supplierId || r.supplierId === q.supplierId) &&
      (!q.abc || r.abc === q.abc) &&
      (!q.onlySuggested || r.rounded > 0) &&
      (!s || r.sku.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.category.toLowerCase().includes(s)),
    );
    const order = { QUIEBRE: 0, REPONER: 1, NUEVO: 2, OK: 3, SOBRE_STOCK: 4, SIN_VENTA: 5, PHASE_OUT: 6, DESCONTINUADO: 7 } as const;
    rows.sort((a, b) => (order[a.state] - order[b.state]) || (a.abc < b.abc ? -1 : a.abc > b.abc ? 1 : 0) || b.rounded - a.rounded);
    const { results: _r, ...header } = run.toObject();
    void _r;
    return { run: header, rows };
  }

  async approve(id: string, userId: string | null): Promise<PlanningRunDocument> {
    const run = await this.findById(id);
    if (run.status === 'approved') return run;
    await this.runModel.updateMany({ _id: { $ne: run._id }, status: 'approved' }, { $set: { status: 'superseded' } }).exec();
    run.status = 'approved';
    run.approvedBy = userId ? new Types.ObjectId(userId) : null;
    run.approvedAt = new Date();
    return run.save();
  }

  /** The columns Power BI read from the spreadsheet's Datos_PowerBI sheet, plus the new ones. */
  async exportCsv(id: string): Promise<string> {
    const run = await this.findById(id);
    const cols = [
      'SKU', 'Producto', 'Categoria', 'Origen', 'Proveedor', 'Clase_ABC', 'Patron', 'Ciclo_Vida', 'Meses_Con_Venta', 'Primera_Venta',
      'Demanda_Base', 'Demanda_Proy_Mensual', 'Demanda_Proy_Anual', 'Desviacion_Mensual', 'Lead_Time_Dias', 'Stock_Seguridad', 'SS_Estadistico',
      'Punto_Reorden', 'Objetivo', 'Stock_Disponible', 'En_Transito', 'Posicion', 'Sugerido', 'Pedido_Redondeado', 'MOQ_Excede_Horizonte',
      'Cobertura_Dias', 'Cobertura_Meses', 'Mismo_Mes_Ano_Anterior', 'Alerta_Interanual', 'Estado', 'Motivos',
    ];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const r of run.results) {
      lines.push([
        r.sku, r.name, r.category, r.origin, r.supplierName ?? '', r.abc, r.pattern ?? '', r.lifecycle, r.monthsWithSales, r.firstSaleMonth ?? '',
        r.base ?? '', r.demandMonthly, Math.round(r.demandMonthly * 12 * 100) / 100, r.sigma, r.leadTimeDays, r.ss, r.ssStat ?? '',
        r.rop, r.target, r.available, r.inTransit, r.position, r.suggested, r.rounded, r.moqExceedsHorizon ? 1 : 0,
        r.coverageDays ?? '', r.coverageMonths ?? '', r.yoy.lastYear ?? '', r.yoy.alert ? 1 : 0, r.state, r.reasons.join(' | '),
      ].map(esc).join(','));
    }
    return '﻿' + lines.join('\r\n');
  }

  /** Suggested quantities grouped by supplier: the purchase proposal of a run. */
  async proposal(id: string) {
    const run = await this.findById(id);
    const groups = new Map<string, { supplierId: string | null; supplierName: string; currency: string; containerMin: number | null; cadenceDays: number | null; lines: PlanningRun['results']; units: number; value: number }>();
    const suppliers = new Map((await this.supplierModel.find().exec()).map((s) => [String(s._id), s]));
    for (const r of run.results) {
      if (r.rounded <= 0) continue;
      if (!PURCHASED_ORIGINS.has(r.origin)) continue; // production and supplies belong to phase 3
      const key = r.supplierId ?? 'none';
      const sup = r.supplierId ? suppliers.get(r.supplierId) : undefined;
      const g = groups.get(key) ?? {
        supplierId: r.supplierId, supplierName: sup?.name ?? 'Sin proveedor', currency: sup?.currency ?? 'USD',
        containerMin: sup?.containerMin ?? null, cadenceDays: sup?.cadenceDays ?? null, lines: [], units: 0, value: 0,
      };
      g.lines.push(r);
      g.units += r.rounded;
      g.value += r.unitCost ? r.unitCost * r.rounded : 0;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.units - a.units);
  }

  /** Turns one supplier's proposal into a draft purchase order, with the planner's overrides. */
  async createPurchaseOrder(
    id: string,
    supplierId: string | null,
    overrides: { sku: string; qty: number; reason?: string }[],
    userId: string | null,
  ) {
    const run = await this.findById(id);
    const supplier = supplierId ? await this.supplierModel.findById(supplierId).exec() : null;
    const overrideMap = new Map(overrides.map((o) => [o.sku, o]));
    const lines = run.results
      .filter((r) => PURCHASED_ORIGINS.has(r.origin) && (r.supplierId ?? null) === (supplierId ?? null) && (r.rounded > 0 || overrideMap.has(r.sku)))
      .map((r) => {
        const o = overrideMap.get(r.sku);
        return { sku: r.sku, name: r.name, qtyOrdered: o ? o.qty : r.rounded, unitCost: r.unitCost, suggested: r.rounded, reason: o?.reason };
      })
      .filter((l) => l.qtyOrdered > 0);
    if (lines.length === 0) throw new BadRequestException('No hay líneas con cantidad para este proveedor');

    const changed = lines.filter((l) => l.qtyOrdered !== l.suggested);
    const notes = [
      `Desde corrida ${run.number}.`,
      ...changed.map((l) => `${l.sku}: sugerido ${l.suggested} → ${l.qtyOrdered}${l.reason ? ` (${l.reason})` : ''}`),
    ].join('\n');

    return this.purchaseOrders.create(
      {
        supplierName: supplier?.name,
        status: 'draft',
        currency: supplier?.currency ?? 'USD',
        lines: lines.map((l) => ({ sku: l.sku, name: l.name, qtyOrdered: l.qtyOrdered, unitCost: l.unitCost })),
        source: 'planning_run',
        notes,
      },
      userId,
      run._id as Types.ObjectId,
    );
  }
}

export type { SkuResult };
