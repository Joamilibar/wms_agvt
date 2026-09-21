import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { StockService } from '../../stock/stock.service.js';
import { StockLot, StockLotDocument } from '../../stock/schemas/stock-lot.schema.js';
import { BomRecipe, BomRecipeDocument } from '../schemas/bom-recipe.schema.js';
import { ProductionOrder, ProductionOrderDocument } from '../schemas/production-order.schema.js';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { PlanningRun, PlanningRunDocument } from '../schemas/planning-run.schema.js';
import { PlanningParamsService } from '../masters/planning-params.service.js';
import { WarehousesService } from '../masters/warehouses.service.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { explode, net, Recipe, NettedRequirement, Requirement } from '../engine/mrp.js';
import { UpsertRecipeDto } from '../dto/production.dto.js';

export interface ProductionPlan {
  runNumber: string | null;
  workshops: string[];
  productionWarehouses: string[];
  candidates: { sku: string; name: string; category: string; state: string; suggested: number; hasRecipe: boolean; recipeVersion: number | null }[];
  requests: { sku: string; qty: number }[];
  materials: NettedRequirement[];
  intermediates: Requirement[];
  missingRecipes: string[];
  summary: { products: number; units: number; materials: number; shortages: number; kgDown: number; kgFeathers: number };
}

/**
 * Production (phase 3): recipes, the material explosion for what the
 * planning run says to make, and the orders that consume the materials at
 * the workshop and create the finished lot. No capacity limit yet (D9).
 */
@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(
    @InjectModel(BomRecipe.name) private recipeModel: Model<BomRecipeDocument>,
    @InjectModel(ProductionOrder.name) private opModel: Model<ProductionOrderDocument>,
    @InjectModel(PlanningItem.name) private itemModel: Model<PlanningItemDocument>,
    @InjectModel(PlanningRun.name) private runModel: Model<PlanningRunDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    @InjectConnection() private connection: Connection,
    private counters: CountersService,
    private params: PlanningParamsService,
    private warehouses: WarehousesService,
    private purchaseOrders: PurchaseOrdersService,
    private stock: StockService,
  ) {}

  // ── recipes ────────────────────────────────────────────────────────────────

  listRecipes(activeOnly = true): Promise<BomRecipeDocument[]> {
    return this.recipeModel.find(activeOnly ? { isActive: true } : {}).sort({ name: 1, version: -1 }).exec();
  }

  async recipeOf(parentSku: string): Promise<BomRecipeDocument | null> {
    return this.recipeModel.findOne({ parentSku, isActive: true }).sort({ version: -1 }).exec();
  }

  /** A new version each time; the previous one is kept, inactive. */
  async saveRecipe(dto: UpsertRecipeDto, setBy: string): Promise<BomRecipeDocument> {
    const current = await this.recipeModel.findOne({ parentSku: dto.parentSku }).sort({ version: -1 }).exec();
    const names = await this.names([...dto.components.map((c) => c.sku), dto.parentSku]);
    const components = dto.components.map((c) => ({ sku: c.sku, name: c.name ?? names.get(c.sku) ?? '', qty: c.qty, uom: c.uom ?? 'un', scrapPct: c.scrapPct ?? null }));
    if (current) {
      const same = JSON.stringify(current.components.map((c) => [c.sku, c.qty, c.uom, c.scrapPct])) === JSON.stringify(components.map((c) => [c.sku, c.qty, c.uom, c.scrapPct]));
      if (same && current.isActive) {
        current.notes = dto.notes ?? current.notes;
        current.name = dto.name ?? current.name;
        return current.save();
      }
    }
    await this.recipeModel.updateMany({ parentSku: dto.parentSku, isActive: true }, { $set: { isActive: false } }).exec();
    return this.recipeModel.create({
      parentSku: dto.parentSku, name: dto.name ?? current?.name ?? names.get(dto.parentSku) ?? '', version: (current?.version ?? 0) + 1,
      isActive: true, components, notes: dto.notes ?? '', setBy,
    });
  }

  async importRecipes(rows: UpsertRecipeDto[], setBy: string): Promise<{ created: number; updated: number; unchanged: number }> {
    let created = 0, updated = 0, unchanged = 0;
    for (const r of rows) {
      const before = await this.recipeModel.findOne({ parentSku: r.parentSku }).sort({ version: -1 }).exec();
      const after = await this.saveRecipe(r, setBy);
      if (!before) created++; else if (after.version > before.version) updated++; else unchanged++;
    }
    return { created, updated, unchanged };
  }

  async deactivateRecipe(parentSku: string): Promise<void> {
    await this.recipeModel.updateMany({ parentSku, isActive: true }, { $set: { isActive: false } }).exec();
  }

  // ── plan ───────────────────────────────────────────────────────────────────

  /**
   * What to make and what it takes. Candidates come from the latest run
   * (nationals with a suggested quantity); the caller may pass its own
   * quantities, which is how the screen lets the planner adjust.
   */
  async plan(requests?: { sku: string; qty: number }[]): Promise<ProductionPlan> {
    const p = await this.params.current();
    const [workshops, productionWarehouses, run] = await Promise.all([
      this.warehouses.findAll().then((ws) => ws.filter((w) => w.role === 'workshop' && w.isActive).map((w) => w.name)),
      this.warehouses.namesFor('production'),
      this.runModel.findOne({ status: 'approved' }).sort({ createdAt: -1 }).exec().then((r) => r ?? this.runModel.findOne().sort({ createdAt: -1 }).exec()),
    ]);
    const recipes = await this.recipeMap();
    const candidates = (run?.results ?? [])
      .filter((r) => r.origin === 'national' && r.rounded > 0)
      .map((r) => ({ sku: r.sku, name: r.name, category: r.category, state: r.state, suggested: r.rounded, hasRecipe: recipes.has(r.sku), recipeVersion: recipes.get(r.sku)?.version ?? null }))
      .sort((a, b) => b.suggested - a.suggested);

    const reqs = requests ?? candidates.map((c) => ({ sku: c.sku, qty: c.suggested }));
    const { materials, intermediates, missingRecipes } = explode(reqs, recipes, p.scrapPct);
    const names = await this.names([...materials.map((m) => m.sku), ...intermediates.map((m) => m.sku)]);
    for (const m of [...materials, ...intermediates]) if (!m.name) m.name = names.get(m.sku) ?? '';

    const available = await this.availableIn(productionWarehouses, materials.map((m) => m.sku));
    const transit = await this.purchaseOrders.inTransit();
    const onOrder = new Map<string, number>();
    for (const [sku, lines] of transit) onOrder.set(sku, lines.reduce((s, l) => s + l.qty, 0));
    const netted = net(materials, available, onOrder).sort((a, b) => b.shortage - a.shortage || a.sku.localeCompare(b.sku));

    const kg = (pred: (m: NettedRequirement) => boolean) => Math.round(netted.filter((m) => m.uom === 'kg' && pred(m)).reduce((s, m) => s + m.required, 0) * 10) / 10;
    return {
      runNumber: run?.number ?? null, workshops, productionWarehouses, candidates, requests: reqs,
      materials: netted, intermediates, missingRecipes,
      summary: {
        products: reqs.filter((r) => r.qty > 0).length, units: reqs.reduce((s, r) => s + r.qty, 0), materials: netted.length,
        shortages: netted.filter((m) => m.shortage > 0).length,
        kgDown: kg((m) => /down/i.test(m.name)), kgFeathers: kg((m) => /feather/i.test(m.name)),
      },
    };
  }

  // ── orders ─────────────────────────────────────────────────────────────────

  listOrders(): Promise<ProductionOrderDocument[]> {
    return this.opModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOrder(id: string): Promise<ProductionOrderDocument> {
    const op = await this.opModel.findById(id).exec();
    if (!op) throw new NotFoundException('Orden de producción no encontrada');
    return op;
  }

  async createOrder(
    input: { workshop: string; destinationWarehouse?: string; lines: { sku: string; qty: number; reason?: string }[]; notes?: string },
    userId: string | null,
  ): Promise<ProductionOrderDocument> {
    const lines = input.lines.filter((l) => l.qty > 0);
    if (lines.length === 0) throw new BadRequestException('La orden necesita al menos una línea');
    const recipes = await this.recipeMap();
    const missing = lines.filter((l) => !recipes.has(l.sku)).map((l) => l.sku);
    if (missing.length) throw new BadRequestException(`Sin receta activa: ${missing.join(', ')}`);
    const p = await this.params.current();
    const names = await this.names(lines.map((l) => l.sku));
    const { materials } = explode(lines, recipes, p.scrapPct);
    const productionWarehouses = await this.warehouses.namesFor('production');
    const available = await this.availableIn(productionWarehouses, materials.map((m) => m.sku));
    const matNames = await this.names(materials.map((m) => m.sku));
    const run = await this.runModel.findOne().sort({ createdAt: -1 }).exec();
    const year = new Date().getFullYear();
    const seq = await this.counters.next(`OP-${year}`);
    return this.opModel.create({
      number: `OP-${year}-${String(seq).padStart(3, '0')}`,
      workshop: input.workshop, destinationWarehouse: input.destinationWarehouse ?? 'Bodega Virtual Tienda', status: 'draft',
      lines: lines.map((l) => ({ sku: l.sku, name: names.get(l.sku) ?? '', qty: l.qty, qtyProduced: 0, recipeVersion: recipes.get(l.sku)!.version, reason: l.reason ?? '' })),
      materials: materials.map((m) => ({ sku: m.sku, name: m.name || matNames.get(m.sku) || '', uom: m.uom, required: m.required, available: available.get(m.sku) ?? 0, consumed: 0 })),
      planningRunId: run?._id ?? null, createdBy: userId ? new Types.ObjectId(userId) : null, notes: input.notes ?? '',
    });
  }

  async approve(id: string, userId: string | null): Promise<ProductionOrderDocument> {
    const op = await this.findOrder(id);
    if (op.status !== 'draft') throw new BadRequestException(`La orden está ${op.status}`);
    op.status = 'approved';
    op.approvedBy = userId ? new Types.ObjectId(userId) : null;
    op.approvedAt = new Date();
    return op.save();
  }

  async start(id: string): Promise<ProductionOrderDocument> {
    const op = await this.findOrder(id);
    if (op.status !== 'approved') throw new BadRequestException('Solo se inicia una orden aprobada');
    op.status = 'in_progress';
    return op.save();
  }

  /**
   * Completion consumes the materials FIFO at the production warehouses
   * (the order's workshop first) and creates one finished lot per line at
   * the destination, costed with what went in. All inside one transaction.
   * BSale must register the same movement; the sync owns the quantities.
   */
  async complete(id: string, produced: { sku: string; qty: number }[], userId: string | null): Promise<{ order: ProductionOrderDocument; lots: string[] }> {
    const op = await this.findOrder(id);
    if (!['approved', 'in_progress'].includes(op.status)) throw new BadRequestException(`La orden está ${op.status}`);
    const p = await this.params.current();
    const recipes = await this.recipeMap();
    const productionWarehouses = await this.warehouses.namesFor('production');
    const order = [op.workshop, ...productionWarehouses.filter((w) => w !== op.workshop)];
    const done = produced.filter((l) => l.qty > 0);
    if (done.length === 0) throw new BadRequestException('Indica lo producido');
    const { materials } = explode(done, recipes, p.scrapPct);

    const session = await this.connection.startSession();
    const lots: string[] = [];
    try {
      await session.withTransaction(async () => {
        lots.length = 0;
        const consumedLots: ProductionOrder['consumedLots'] = [];
        let totalCost = 0;
        for (const m of materials) {
          let remaining = m.required;
          for (const wh of order) {
            if (remaining <= 0.0005) break;
            const { consumed, deficit } = await this.stock.processFIFO(m.sku, remaining, wh, session);
            for (const c of consumed) { consumedLots.push({ sku: m.sku, lot: c.lot, qty: c.qty, unitCost: c.unitCost, warehouse: wh }); totalCost += c.qty * c.unitCost; }
            remaining = deficit;
          }
          if (remaining > 0.0005) throw new BadRequestException(`Falta ${Math.round(remaining * 1000) / 1000} ${m.uom} de ${m.name || m.sku} en ${order.join(' / ')}`);
        }
        const unitsMade = done.reduce((s, l) => s + l.qty, 0);
        const unitCost = unitsMade > 0 ? Math.round(totalCost / unitsMade) : 0;
        const now = new Date();
        const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
        for (const l of done) {
          const line = op.lines.find((x) => x.sku === l.sku);
          if (!line) throw new BadRequestException(`La orden no tiene la línea ${l.sku}`);
          let lotCode = `${op.number}-${stamp}`;
          let n = 2;
          while (await this.stockModel.exists({ lot: lotCode, warehouse: op.destinationWarehouse, isActive: true }).session(session)) lotCode = `${op.number}-${stamp}-${n++}`;
          await this.stockModel.create([{
            sku: l.sku, name: line.name || l.sku, lot: lotCode, entryDate: now, qty: l.qty, initialQty: l.qty, unitCost,
            warehouse: op.destinationWarehouse, supplier: op.workshop, isActive: true, location: '', createdBy: userId ? new Types.ObjectId(userId) : null,
          }], { session });
          line.qtyProduced += l.qty;
          lots.push(lotCode);
        }
        for (const m of op.materials) {
          const c = consumedLots.filter((x) => x.sku === m.sku).reduce((s, x) => s + x.qty, 0);
          m.consumed += c;
        }
        op.consumedLots.push(...consumedLots);
        op.producedLots.push(...lots);
        op.status = 'completed';
        op.completedAt = now;
        op.markModified('lines'); op.markModified('materials');
        await op.save({ session });
      });
    } finally {
      await session.endSession();
    }
    this.logger.warn(`${op.number} completada: ${lots.length} lotes en ${op.destinationWarehouse}, insumos consumidos en ${op.workshop}. Registrar en BSale o el próximo sync lo revertirá.`);
    return { order: op, lots };
  }

  async cancel(id: string): Promise<ProductionOrderDocument> {
    const op = await this.findOrder(id);
    if (op.status === 'completed') throw new BadRequestException('Una orden completada no se anula');
    op.status = 'cancelled';
    return op.save();
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async recipeMap(): Promise<Map<string, Recipe>> {
    const docs = await this.recipeModel.find({ isActive: true }).exec();
    return new Map(docs.map((d) => [d.parentSku, { parentSku: d.parentSku, version: d.version, components: d.components.map((c) => ({ sku: c.sku, name: c.name, qty: c.qty, uom: c.uom, scrapPct: c.scrapPct })) }]));
  }

  private async names(skus: string[]): Promise<Map<string, string>> {
    const items = await this.itemModel.find({ sku: { $in: [...new Set(skus)] } }, { sku: 1, name: 1 }).exec();
    return new Map(items.map((i) => [i.sku, i.name]));
  }

  private async availableIn(warehouses: string[], skus: string[]): Promise<Map<string, number>> {
    if (warehouses.length === 0 || skus.length === 0) return new Map();
    const rows = await this.stockModel.aggregate<{ _id: string; available: number }>([
      { $match: { isActive: true, warehouse: { $in: warehouses }, sku: { $in: skus } } },
      { $group: { _id: '$sku', available: { $sum: { $subtract: ['$qty', '$reservedQty'] } } } },
    ]).exec();
    return new Map(rows.map((r) => [r._id, Math.round(r.available * 1000) / 1000]));
  }
}
