import { SheetingRecipesService } from './sheeting-recipes.service.js';

/** A frozen quote's result, trimmed to what freeze reads. */
const result = {
  model: { code: 'ENCIMERA_CRUCERO', version: 1, name: 'Encimera', family: 'encimera' },
  fabric: { sku: 'TELA-500', name: '500TC', rollWidthCm: 305, usableWidthCm: 303, directional: false },
  fabrics: [
    { slot: 'base', sku: 'TELA-500', name: '500TC', rollWidthCm: 305, consumption: { linearMetresPerUnit: 2.29 } },
    { slot: 'marco', sku: 'LINO-290', name: 'Lino', rollWidthCm: 290, consumption: { linearMetresPerUnit: 1.34 } },
  ],
  pieces: [{ role: 'centro', count: 1, widthCm: 229, lengthCm: 279, orientation: 'contrahilo' }],
  consumption: { linearMetresPerUnit: 3.63, cuttingScrapPct: 0.03, wastePct: 0.105 },
  supplies: [{ sku: 'ETIQ', name: 'Etiqueta', qty: 1, uom: 'un', unitCost: 50, cost: 50 }],
  cost: { total: 51247, labour: 14000 },
};

function build() {
  let saved = 0;
  const quote: Record<string, unknown> & { save: () => Promise<unknown> } = {
    _id: 'q1', number: 'COT-2026-001', productSku: '62697040357079', productName: 'Sábana Encimera Queen', result, bomRecipeId: null, bomRecipeVersion: null,
    save: () => { saved++; return Promise.resolve(quote); },
  };
  const quoteModel = { findById: () => ({ exec: () => Promise.resolve(quote) }) };
  const recipes: { parentSku: string; components: unknown[]; notes: string; version: number; _id: string }[] = [];
  const production = {
    saveRecipe: (dto: { parentSku: string; components: unknown[]; notes: string }) => {
      const r = { ...dto, version: recipes.length + 1, _id: `r${recipes.length + 1}` };
      recipes.push(r);
      return Promise.resolve(r);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const svc = new SheetingRecipesService(quoteModel as any, {} as any, {} as any, {} as any, production as any);
  return { svc, quote, recipes, saved: () => saved };
}

describe('freeze (spec invariant 9)', () => {
  it('9 · freezing twice creates one recipe version and returns it the second time', async () => {
    const { svc, quote, recipes } = build();
    const first = await svc.freeze('q1', 'tester');
    expect(first.created).toBe(true);
    expect(recipes).toHaveLength(1);
    expect(quote.bomRecipeId).toBe('r1');
    const second = await svc.freeze('q1', 'tester');
    expect(second.created).toBe(false);
    expect(second.recipeId).toBe('r1');
    expect(recipes).toHaveLength(1);
  });

  it('the BOM is physical material only: one component per fabric in metres with the cutting scrap, supplies in units, no labour', async () => {
    const { svc, recipes } = build();
    await svc.freeze('q1', 'tester');
    const [r] = recipes;
    expect(r.parentSku).toBe('62697040357079');
    expect(r.components).toEqual([
      { sku: 'TELA-500', name: '500TC', qty: 2.29, uom: 'm', scrapPct: 0.03 },
      { sku: 'LINO-290', name: 'Lino', qty: 1.34, uom: 'm', scrapPct: 0.03 },
      { sku: 'ETIQ', name: 'Etiqueta', qty: 1, uom: 'un', scrapPct: 0 },
    ]);
    expect(JSON.stringify(r.components)).not.toMatch(/14000|labour|taller/);
    expect(r.notes).toMatch(/ENCIMERA_CRUCERO v1/);
    expect(r.notes).toMatch(/3\.63 ml\/u/);
  });

  it('a quote without a product SKU cannot be frozen', async () => {
    const { svc, quote } = build();
    quote.productSku = null;
    await expect(svc.freeze('q1', 'tester')).rejects.toMatchObject({ response: { details: { code: 'NO_PRODUCT_SKU' } } });
  });

  it('a frame cut from the centre fabric merges into one component per SKU', async () => {
    const { svc, quote, recipes } = build();
    (quote.result as typeof result).fabrics = [
      { slot: 'base', sku: 'TELA-500', name: '500TC', rollWidthCm: 305, consumption: { linearMetresPerUnit: 2.29 } },
      { slot: 'marco', sku: 'TELA-500', name: '500TC', rollWidthCm: 305, consumption: { linearMetresPerUnit: 1.18 } },
    ];
    await svc.freeze('q1', 'tester');
    expect(recipes[0].components[0]).toEqual({ sku: 'TELA-500', name: '500TC', qty: 3.47, uom: 'm', scrapPct: 0.03 });
    expect(recipes[0].components).toHaveLength(2);
  });
});
