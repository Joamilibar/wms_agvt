import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CountersService } from '../../common/counters/counters.service.js';
import { SheetingQuote, SheetingQuoteDocument } from '../schemas/sheeting-quote.schema.js';
import { PlanningItem, PlanningItemDocument } from '../schemas/planning-item.schema.js';
import { ProductionService } from '../production/production.service.js';
import { SheetingCalcService, QuoteInput } from './sheeting-calc.service.js';

export interface SaveQuoteInput extends QuoteInput {
  productSku?: string | null;
  notes?: string;
}

/**
 * Saved quotes and their freezing into `BomRecipe`.
 *
 * A frozen quote becomes one component per fabric (`uom: 'm'`, the metres
 * per unit, cutting waste as the component's own scrap) plus one per
 * supply. Labour never enters: the BOM is physical material, the workshop
 * is a conversion cost in `workshop_rates`, and putting it here would break
 * the MRP explosion. Freezing twice returns the same recipe.
 */
@Injectable()
export class SheetingRecipesService {
  private readonly logger = new Logger(SheetingRecipesService.name);

  constructor(
    @InjectModel(SheetingQuote.name) private quoteModel: Model<SheetingQuoteDocument>,
    @InjectModel(PlanningItem.name) private itemModel: Model<PlanningItemDocument>,
    private counters: CountersService,
    private calc: SheetingCalcService,
    private production: ProductionService,
  ) {}

  list(filter: { modelCode?: string; productSku?: string; fabricSku?: string; frozen?: boolean; limit?: number } = {}): Promise<SheetingQuoteDocument[]> {
    const q: Record<string, unknown> = {};
    if (filter.modelCode) q.modelCode = filter.modelCode;
    if (filter.productSku) q.productSku = filter.productSku;
    if (filter.fabricSku) q.fabricSku = filter.fabricSku;
    if (filter.frozen !== undefined) q.bomRecipeId = filter.frozen ? { $ne: null } : null;
    return this.quoteModel.find(q).sort({ createdAt: -1 }).limit(filter.limit ?? 100).exec();
  }

  async findById(id: string): Promise<SheetingQuoteDocument> {
    const q = await this.quoteModel.findById(id).exec();
    if (!q) throw new NotFoundException('Cotización no encontrada');
    return q;
  }

  /** Recomputes and stores: a saved quote is always what the engine says today, with the versions it used. */
  async save(input: SaveQuoteInput, userId: string | null, setBy: string): Promise<SheetingQuoteDocument> {
    const { productSku, notes, ...quoteInput } = input;
    const result = await this.calc.quote(quoteInput);
    const product = productSku ? await this.itemModel.findOne({ sku: productSku }, { name: 1 }).exec() : null;
    const year = new Date().getFullYear();
    const seq = await this.counters.next(`COT-${year}`);
    const doc = await this.quoteModel.create({
      number: `COT-${year}-${String(seq).padStart(3, '0')}`,
      productSku: productSku ?? null, productName: product?.name ?? '',
      modelCode: result.model.code, modelVersion: result.model.version,
      fabricSku: result.fabric.sku, frameFabricSku: quoteInput.frameFabricSku ?? null,
      input: quoteInput, result, paramsVersion: result.paramsVersion,
      costSource: result.fabrics.some((f) => f.cost.costSource === 'stale') ? 'stale' : 'bsale',
      costSyncedAt: result.fabricCost.costSyncedAt,
      createdBy: userId ? new Types.ObjectId(userId) : null, setBy, notes: notes ?? '',
    });
    this.logger.log(`${doc.number}: ${doc.modelCode} v${doc.modelVersion} · ${result.consumption.linearMetresPerUnit} ml/u · $${result.cost.total}`);
    return doc;
  }

  /**
   * Freezes the quote as the next `BomRecipe` version of its product.
   * Idempotent: a quote already frozen returns the recipe it produced.
   */
  async freeze(id: string, setBy: string): Promise<{ quote: SheetingQuoteDocument; recipeId: string; recipeVersion: number; created: boolean }> {
    const quote = await this.findById(id);
    if (quote.bomRecipeId) return { quote, recipeId: String(quote.bomRecipeId), recipeVersion: quote.bomRecipeVersion ?? 0, created: false };
    if (!quote.productSku) throw new BadRequestException({ message: 'La cotización no tiene SKU de producto: asígnalo antes de congelar', error: 'Bad Request', details: { code: 'NO_PRODUCT_SKU' } });

    const r = quote.result;
    // One component per fabric SKU: a frame cut from the centre's fabric adds to the same line.
    const fabricBySku = new Map<string, { sku: string; name: string; qty: number; uom: 'm'; scrapPct: number }>();
    for (const f of r.fabrics) {
      const cur = fabricBySku.get(f.sku);
      if (cur) cur.qty = Math.round((cur.qty + f.consumption.linearMetresPerUnit) * 10000) / 10000;
      else fabricBySku.set(f.sku, { sku: f.sku, name: f.name, qty: f.consumption.linearMetresPerUnit, uom: 'm', scrapPct: r.consumption.cuttingScrapPct });
    }
    const components = [
      ...fabricBySku.values(),
      ...r.supplies.map((s) => ({ sku: s.sku, name: s.name, qty: s.qty, uom: s.uom as 'un' | 'kg' | 'm', scrapPct: 0 })),
    ];
    const pieces = r.pieces.map((p) => `${p.count}× ${p.role} ${p.widthCm}×${p.lengthCm} ${p.orientation}`).join('; ');
    const notes = `Sabanería ${quote.number}: modelo ${r.model.code} v${r.model.version}, tela ${r.fabrics.map((f) => `${f.name || f.sku} (${f.rollWidthCm} cm)`).join(' + ')}, ${r.consumption.linearMetresPerUnit} ml/u, merma de encaje ${Math.round(r.consumption.wastePct * 1000) / 10} %. Piezas: ${pieces}.`;
    const recipe = await this.production.saveRecipe({ parentSku: quote.productSku, name: quote.productName || undefined, components, notes }, setBy);
    quote.bomRecipeId = recipe._id;
    quote.bomRecipeVersion = recipe.version;
    await quote.save();
    this.logger.log(`${quote.number} congelada como receta ${quote.productSku} v${recipe.version}`);
    return { quote, recipeId: String(recipe._id), recipeVersion: recipe.version, created: true };
  }

  /** Quotes per model code, for the model list. */
  async usage(): Promise<Record<string, number>> {
    const rows = await this.quoteModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$modelCode', n: { $sum: 1 } } }]).exec();
    return Object.fromEntries(rows.map((x) => [x._id, x.n]));
  }
}
