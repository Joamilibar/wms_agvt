import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PackRecipe, PackRecipeDocument, PackComponent } from './schemas/pack-recipe.schema.js';
import { StockLot, StockLotDocument } from '../stock/schemas/stock-lot.schema.js';
import { CreatePackRecipeDto } from './dto/create-pack-recipe.dto.js';
import { UpdatePackRecipeDto } from './dto/update-pack-recipe.dto.js';
import { BsaleService, BsalePack } from '../bsale/bsale.service.js';

export interface PackImportResult {
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: string[];
  warnings: string[];
}

function sameRecipe(
  existing: PackRecipe,
  next: { name: string; bsaleVariantId: string; components: PackComponent[] },
): boolean {
  if (existing.name !== next.name || existing.bsaleVariantId !== next.bsaleVariantId) return false;
  if (!existing.isActive) return false;
  if (existing.components.length !== next.components.length) return false;
  const key = (c: PackComponent) => `${c.sku}|${c.bsaleVariantId ?? ''}|${c.qtyPerPack}`;
  const a = existing.components.map(key).sort();
  const b = next.components.map(key).sort();
  return a.every((k, i) => k === b[i]);
}

export interface PackComponentAvailability {
  sku: string;
  name: string;
  qtyPerPack: number;
  physical: number;
  reserved: number;
  available: number;
  /** Complete packs this component alone could cover. */
  packsFromThis: number;
}

export interface PackAvailability {
  packSku: string;
  name: string;
  bsaleVariantId: string | null;
  warehouse: string;
  packsAvailable: number;
  packsPhysical: number;
  /** The component that caps the total — what to replenish first. */
  limitedBy: PackComponentAvailability | null;
  components: PackComponentAvailability[];
}

@Injectable()
export class PacksService {
  private readonly logger = new Logger(PacksService.name);

  constructor(
    @InjectModel(PackRecipe.name) private recipeModel: Model<PackRecipeDocument>,
    @InjectModel(StockLot.name) private stockModel: Model<StockLotDocument>,
    private bsaleService: BsaleService,
  ) {}

  // ── recipes ────────────────────────────────────────────────────────────────

  async findAll(includeInactive = false): Promise<PackRecipeDocument[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return this.recipeModel.find(filter).sort({ name: 1 }).exec();
  }

  async findBySku(packSku: string): Promise<PackRecipeDocument> {
    const recipe = await this.recipeModel.findOne({ packSku }).exec();
    if (!recipe) throw new NotFoundException(`No hay receta para el pack ${packSku}`);
    return recipe;
  }

  async create(dto: CreatePackRecipeDto): Promise<PackRecipeDocument> {
    const existing = await this.recipeModel.findOne({ packSku: dto.packSku }).exec();
    if (existing) throw new ConflictException(`Ya existe una receta para ${dto.packSku}`);
    return this.recipeModel.create(dto);
  }

  async update(packSku: string, dto: UpdatePackRecipeDto): Promise<PackRecipeDocument> {
    const recipe = await this.findBySku(packSku);
    Object.assign(recipe, dto);
    return recipe.save();
  }

  async remove(packSku: string): Promise<PackRecipeDocument> {
    const recipe = await this.findBySku(packSku);
    recipe.isActive = false;
    return recipe.save();
  }

  // ── import from BSale ──────────────────────────────────────────────────────

  /**
   * Pulls every pack composition from BSale and upserts it here.
   *
   * Idempotent: a recipe whose components already match is left alone, one
   * that differs is overwritten (BSale is the source for the recipe too — the
   * WMS only holds it because BSale keeps no stock for packs). Recipes that
   * were entered by hand and BSale does not know are not touched: they may be
   * internal bundles that never went into the ERP.
   *
   * A component listed with quantity 0 is dropped with a warning rather than
   * failing the whole import — it is a data error on the BSale side, and the
   * other packs should not wait for it. A pack whose every component is
   * dropped is skipped, because a recipe without components computes to zero.
   */
  async importFromBsale(): Promise<PackImportResult> {
    const catalog = await this.bsaleService.getPackCatalog();
    const result: PackImportResult = {
      found: catalog.length, created: 0, updated: 0, unchanged: 0, skipped: [], warnings: [],
    };

    for (const pack of catalog) {
      const components = this.usableComponents(pack, result.warnings);
      if (components.length === 0) {
        result.skipped.push(`${pack.packSku} (${pack.name}): sin componentes utilizables`);
        continue;
      }

      const existing = await this.recipeModel.findOne({ packSku: pack.packSku }).exec();
      const next = {
        name: pack.name,
        bsaleVariantId: pack.bsaleVariantId,
        components,
        isActive: true,
        notes: `Importado de BSale (producto ${pack.bsaleProductId})`,
      };

      if (!existing) {
        await this.recipeModel.create({ packSku: pack.packSku, ...next });
        result.created++;
      } else if (sameRecipe(existing, next)) {
        result.unchanged++;
      } else {
        Object.assign(existing, next);
        await existing.save();
        result.updated++;
      }
    }

    this.logger.log(
      `Pack import: ${result.found} found, ${result.created} created, ` +
      `${result.updated} updated, ${result.unchanged} unchanged, ${result.skipped.length} skipped`,
    );
    return result;
  }

  private usableComponents(pack: BsalePack, warnings: string[]): PackComponent[] {
    const out: PackComponent[] = [];
    for (const c of pack.components) {
      const qtyPerPack = Math.floor(c.qtyPerPack);
      if (qtyPerPack < 1) {
        warnings.push(
          `${pack.packSku} (${pack.name}): componente ${c.sku} (${c.name}) viene con cantidad ` +
          `${c.qtyPerPack} en BSale y se omitió — corregirlo allá`,
        );
        continue;
      }
      if (qtyPerPack !== c.qtyPerPack) {
        warnings.push(`${pack.packSku}: cantidad ${c.qtyPerPack} de ${c.sku} redondeada a ${qtyPerPack}`);
      }
      out.push({ sku: c.sku, name: c.name, bsaleVariantId: c.bsaleVariantId, qtyPerPack });
    }
    return out;
  }

  // ── availability ───────────────────────────────────────────────────────────

  /**
   * How many complete packs the components on hand can make.
   *
   * The rule is the minimum across components of `stock / qtyPerPack`, floored —
   * not the plain minimum stock. With a component that a pack consumes twice the
   * two differ: 5 pillowcases at 2 per pack cover 2 packs, not 5. A pack is only
   * complete when every component is there, so the smallest of those quotients
   * is the answer and the component that produced it is the one to replenish.
   *
   * Availability is computed per warehouse: components sitting in different
   * warehouses cannot be assembled into a pack without moving them first.
   */
  async availability(options: { warehouse?: string; packSku?: string } = {}): Promise<PackAvailability[]> {
    const filter: Record<string, unknown> = { isActive: true };
    if (options.packSku) filter.packSku = options.packSku;

    const recipes = await this.recipeModel.find(filter).sort({ name: 1 }).exec();
    if (recipes.length === 0) return [];

    const componentSkus = [
      ...new Set(recipes.flatMap((r) => r.components.map((c) => c.sku))),
    ];

    const match: Record<string, unknown> = { sku: { $in: componentSkus }, isActive: true };
    if (options.warehouse) match.warehouse = options.warehouse;

    const rows = await this.stockModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { sku: '$sku', warehouse: '$warehouse' },
          physical: { $sum: '$qty' },
          reserved: { $sum: '$reservedQty' },
        },
      },
    ]).exec();

    const stockBy = new Map<string, { physical: number; reserved: number }>();
    const warehouses = new Set<string>();
    for (const row of rows) {
      stockBy.set(row._id.sku + '|||' + row._id.warehouse, {
        physical: row.physical || 0,
        reserved: row.reserved || 0,
      });
      warehouses.add(row._id.warehouse);
    }

    // With no stock anywhere the pack is still worth reporting as zero, so fall
    // back to the requested warehouse rather than returning nothing.
    if (warehouses.size === 0 && options.warehouse) warehouses.add(options.warehouse);

    const out: PackAvailability[] = [];

    for (const recipe of recipes) {
      for (const warehouse of warehouses) {
        const components: PackComponentAvailability[] = recipe.components.map((c) => {
          const stock = stockBy.get(c.sku + '|||' + warehouse) || { physical: 0, reserved: 0 };
          const available = Math.max(0, stock.physical - stock.reserved);
          return {
            sku: c.sku,
            name: c.name,
            qtyPerPack: c.qtyPerPack,
            physical: stock.physical,
            reserved: stock.reserved,
            available,
            packsFromThis: Math.floor(available / c.qtyPerPack),
          };
        });

        // A recipe with no components cannot yield a pack; saying "infinite"
        // (the empty minimum) would be worse than saying zero.
        const packsAvailable = components.length
          ? Math.min(...components.map((c) => c.packsFromThis))
          : 0;
        const packsPhysical = components.length
          ? Math.min(...components.map((c) => Math.floor(c.physical / c.qtyPerPack)))
          : 0;

        const limitedBy = components.length
          ? components.reduce((worst, c) => (c.packsFromThis < worst.packsFromThis ? c : worst))
          : null;

        out.push({
          packSku: recipe.packSku,
          name: recipe.name,
          bsaleVariantId: recipe.bsaleVariantId,
          warehouse,
          packsAvailable,
          packsPhysical,
          limitedBy,
          components,
        });
      }
    }

    return out;
  }
}
