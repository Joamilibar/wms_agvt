import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PacksService } from './packs.service.js';
import { PackRecipe } from './schemas/pack-recipe.schema.js';
import { StockLot } from '../stock/schemas/stock-lot.schema.js';
import { BsaleService, BsalePack } from '../bsale/bsale.service.js';

/**
 * El stock de un pack no existe en BSale: se calcula desde los componentes.
 * La regla es el mínimo de `stock / qtyPerPack`, no el mínimo de `stock` — con
 * un componente que el pack consume dos veces las dos lecturas se separan.
 */

const JUEGO_KING = {
  packSku: 'PACK-KING-CRUCERO-BB',
  name: 'Juego de sábanas King Crucero blanco/blanco',
  bsaleVariantId: '3509',
  isActive: true,
  components: [
    { sku: 'SAB-BAJERA-KC', name: 'Sábana bajera King Crucero', qtyPerPack: 1, bsaleVariantId: null },
    { sku: 'SAB-ENCIMERA-KC', name: 'Sábana encimera King Crucero', qtyPerPack: 1, bsaleVariantId: null },
    { sku: 'FUNDA-KC', name: 'Funda de almohada King Crucero', qtyPerPack: 2, bsaleVariantId: null },
  ],
};

describe('PacksService.availability', () => {
  let service: PacksService;
  let testingModule: TestingModule;
  let recipes: any[];
  let lots: any[];

  beforeEach(async () => {
    recipes = [JUEGO_KING];
    lots = [];

    const recipeModel: any = {
      find: () => ({
        sort: () => ({ exec: async () => recipes.filter((r) => r.isActive) }),
      }),
    };

    // Reproduce el $group por (sku, bodega) que hace la agregación real.
    const stockModel: any = {
      aggregate: (pipeline: any[]) => ({
        exec: async () => {
          const match = pipeline[0].$match;
          const skus: string[] = match.sku.$in;
          const grouped = new Map<string, any>();
          for (const l of lots) {
            if (!skus.includes(l.sku)) continue;
            if (match.warehouse && l.warehouse !== match.warehouse) continue;
            const key = l.sku + '|' + l.warehouse;
            const g = grouped.get(key) || { _id: { sku: l.sku, warehouse: l.warehouse }, physical: 0, reserved: 0 };
            g.physical += l.qty;
            g.reserved += l.reservedQty || 0;
            grouped.set(key, g);
          }
          return [...grouped.values()];
        },
      }),
    };

    testingModule = await Test.createTestingModule({
      providers: [
        PacksService,
        { provide: getModelToken(PackRecipe.name), useValue: recipeModel },
        { provide: getModelToken(StockLot.name), useValue: stockModel },
        { provide: BsaleService, useValue: {} },
      ],
    }).compile();

    service = testingModule.get(PacksService);
  });

  afterEach(async () => {
    await testingModule?.close();
  });

  const stock = (sku: string, qty: number, reserved = 0, warehouse = 'Central') =>
    lots.push({ sku, qty, reservedQty: reserved, warehouse });

  it('toma el componente que menos packs cubre — el caso del enunciado', async () => {
    stock('SAB-BAJERA-KC', 3);
    stock('SAB-ENCIMERA-KC', 5);
    stock('FUNDA-KC', 42);

    const [pack] = await service.availability({ warehouse: 'Central' });

    // 3/1 = 3 · 5/1 = 5 · 42/2 = 21  ->  el mínimo es 3
    expect(pack.packsAvailable).toBe(3);
    expect(pack.limitedBy?.sku).toBe('SAB-BAJERA-KC');
  });

  it('divide por las unidades que el pack consume, no compara stock crudo', async () => {
    stock('SAB-BAJERA-KC', 100);
    stock('SAB-ENCIMERA-KC', 100);
    stock('FUNDA-KC', 5);

    const [pack] = await service.availability({ warehouse: 'Central' });

    // El mínimo crudo diría 5. Con 2 fundas por pack solo alcanza para 2.
    expect(pack.packsAvailable).toBe(2);
    expect(pack.limitedBy?.sku).toBe('FUNDA-KC');
  });

  it('un componente ausente deja el pack en cero', async () => {
    stock('SAB-BAJERA-KC', 10);
    stock('FUNDA-KC', 40);
    // sin encimera

    const [pack] = await service.availability({ warehouse: 'Central' });

    expect(pack.packsAvailable).toBe(0);
    expect(pack.limitedBy?.sku).toBe('SAB-ENCIMERA-KC');
  });

  it('descuenta lo reservado por órdenes en curso', async () => {
    stock('SAB-BAJERA-KC', 10, 8);
    stock('SAB-ENCIMERA-KC', 10);
    stock('FUNDA-KC', 40);

    const [pack] = await service.availability({ warehouse: 'Central' });

    expect(pack.packsAvailable).toBe(2);   // 10 - 8 reservadas
    expect(pack.packsPhysical).toBe(10);   // lo que hay en el estante
  });

  it('calcula por bodega: los componentes no se arman a distancia', async () => {
    stock('SAB-BAJERA-KC', 5, 0, 'Central');
    stock('SAB-ENCIMERA-KC', 5, 0, 'Central');
    stock('FUNDA-KC', 10, 0, 'Central');
    stock('SAB-BAJERA-KC', 50, 0, 'Norte');   // en Norte falta todo lo demás

    const result = await service.availability();
    const central = result.find((p) => p.warehouse === 'Central')!;
    const norte = result.find((p) => p.warehouse === 'Norte')!;

    expect(central.packsAvailable).toBe(5);
    expect(norte.packsAvailable).toBe(0);
  });

  it('una receta sin componentes vale cero, no infinito', async () => {
    recipes = [{ ...JUEGO_KING, components: [] }];
    stock('SAB-BAJERA-KC', 100, 0, 'Central');

    const result = await service.availability({ warehouse: 'Central' });

    expect(result[0].packsAvailable).toBe(0);
    expect(result[0].limitedBy).toBeNull();
  });
});

/**
 * BSale sí trae la composición, inline en `pack_details` del producto. El
 * import la copia acá y tiene que ser idempotente: correrlo dos veces no
 * puede duplicar ni reescribir lo que ya está igual.
 */
describe('PacksService.importFromBsale', () => {
  let recipes: any[];
  let catalog: BsalePack[];

  const bsalePack = (over: Partial<BsalePack> = {}): BsalePack => ({
    packSku: '1783363840909',
    name: 'Juego de Cubreplumón 500H Blanco/Taupe Queen Crucero',
    bsaleVariantId: '5059',
    bsaleProductId: '2982',
    components: [
      { bsaleVariantId: '4971', sku: '78127516536750', name: 'Cubreplumón Queen', qtyPerPack: 1 },
      { bsaleVariantId: '4973', sku: '78127587844305', name: 'Funda Americana', qtyPerPack: 2 },
    ],
    ...over,
  });

  async function build() {
    const recipeModel: any = {
      findOne: (filter: any) => ({
        exec: async () => {
          const doc = recipes.find((r) => r.packSku === filter.packSku);
          if (!doc) return null;
          doc.save = async () => doc;
          return doc;
        },
      }),
      create: async (doc: any) => {
        recipes.push({ ...doc });
        return doc;
      },
    };
    const bsale = { getPackCatalog: async () => catalog };
    const m = await Test.createTestingModule({
      providers: [
        PacksService,
        { provide: getModelToken(PackRecipe.name), useValue: recipeModel },
        { provide: getModelToken(StockLot.name), useValue: {} },
        { provide: BsaleService, useValue: bsale },
      ],
    }).compile();
    return m.get(PacksService);
  }

  beforeEach(() => {
    recipes = [];
    catalog = [bsalePack()];
  });

  it('crea la receta con los SKU de los componentes y sus cantidades', async () => {
    const service = await build();
    const result = await service.importFromBsale();

    expect(result).toMatchObject({ found: 1, created: 1, updated: 0, unchanged: 0 });
    expect(recipes).toHaveLength(1);
    expect(recipes[0].packSku).toBe('1783363840909');
    expect(recipes[0].components).toEqual([
      expect.objectContaining({ sku: '78127516536750', bsaleVariantId: '4971', qtyPerPack: 1 }),
      expect.objectContaining({ sku: '78127587844305', bsaleVariantId: '4973', qtyPerPack: 2 }),
    ]);
  });

  it('es idempotente: la segunda corrida no toca lo que ya coincide', async () => {
    const service = await build();
    await service.importFromBsale();
    const second = await service.importFromBsale();

    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(recipes).toHaveLength(1);
  });

  it('sobreescribe una receta que cambió en BSale', async () => {
    const service = await build();
    await service.importFromBsale();

    catalog = [bsalePack({
      components: [
        { bsaleVariantId: '4971', sku: '78127516536750', name: 'Cubreplumón Queen', qtyPerPack: 1 },
        { bsaleVariantId: '4973', sku: '78127587844305', name: 'Funda Americana', qtyPerPack: 4 },
      ],
    })];
    const result = await service.importFromBsale();

    expect(result).toMatchObject({ updated: 1, unchanged: 0 });
    expect(recipes[0].components[1].qtyPerPack).toBe(4);
  });

  it('omite un componente con cantidad 0 y lo reporta, sin frenar el pack', async () => {
    catalog = [bsalePack({
      components: [
        { bsaleVariantId: '4971', sku: '78127516536750', name: 'Cubreplumón Queen', qtyPerPack: 1 },
        { bsaleVariantId: '9999', sku: '72442489189675', name: 'Plumón Twin', qtyPerPack: 0 },
      ],
    })];
    const service = await build();
    const result = await service.importFromBsale();

    expect(result.created).toBe(1);
    expect(recipes[0].components).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('72442489189675');
  });

  it('salta un pack que se queda sin componentes utilizables', async () => {
    catalog = [bsalePack({ components: [
      { bsaleVariantId: '9999', sku: 'X', name: 'X', qtyPerPack: 0 },
    ] })];
    const service = await build();
    const result = await service.importFromBsale();

    expect(result.created).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(recipes).toHaveLength(0);
  });
});
