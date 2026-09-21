import { explode, net, Recipe } from './mrp.js';

const recipes = new Map<string, Recipe>([
  ['PLUMON-K', { parentSku: 'PLUMON-K', version: 1, components: [
    { sku: 'FUNDA-K', name: 'Funda King', qty: 1, uom: 'un', scrapPct: null },
    { sku: 'DOWN-770', name: 'Duvet 770 FP', qty: 1.03, uom: 'kg', scrapPct: null },
  ] }],
  ['FUNDA-K', { parentSku: 'FUNDA-K', version: 1, components: [
    { sku: 'TELA-420', name: 'Tela 420TC', qty: 6.2, uom: 'm', scrapPct: 0.05 },
    { sku: 'ETIQ', name: 'Etiqueta', qty: 1, uom: 'un', scrapPct: 0 },
  ] }],
  ['ALM-K', { parentSku: 'ALM-K', version: 2, components: [
    { sku: 'FUNDA-ALM', name: 'Funda almohada', qty: 1, uom: 'un', scrapPct: 0 },
    { sku: 'PLUMA', name: 'Pluma', qty: 0.372, uom: 'kg', scrapPct: null },
    { sku: 'DOWN-770', name: 'Duvet 770 FP', qty: 0.608, uom: 'kg', scrapPct: null },
  ] }],
]);

describe('mrp explode', () => {
  it('explodes multilevel, applies scrap and reports the intermediate', () => {
    const { materials, intermediates, missingRecipes } = explode([{ sku: 'PLUMON-K', qty: 10 }], recipes, 0.03);
    const m = Object.fromEntries(materials.map((x) => [x.sku, x]));
    expect(missingRecipes).toEqual([]);
    expect(intermediates.map((x) => x.sku)).toEqual(['FUNDA-K']);
    expect(intermediates[0].required).toBe(10); // no scrap on pieces unless the recipe says so
    expect(m['DOWN-770'].required).toBeCloseTo(10 * 1.03 * 1.03, 3); // default scrap 3 %
    expect(m['TELA-420'].required).toBeCloseTo(10 * 6.2 * 1.05, 3); // its own 5 %
    expect(m['ETIQ'].required).toBe(10);
    expect(m['TELA-420'].level).toBe(2);
    expect(m['TELA-420'].uom).toBe('m');
  });

  it('adds up a shared material across parents and remembers who asked', () => {
    const { materials } = explode([{ sku: 'PLUMON-K', qty: 10 }, { sku: 'ALM-K', qty: 20 }], recipes, 0);
    const down = materials.find((x) => x.sku === 'DOWN-770')!;
    expect(down.required).toBeCloseTo(10 * 1.03 + 20 * 0.608, 3);
    expect(down.from.map((f) => f.parentSku).sort()).toEqual(['ALM-K', 'PLUMON-K']);
  });

  it('a requested product without a recipe is reported, not silently skipped', () => {
    const { missingRecipes, materials } = explode([{ sku: 'NOPE', qty: 5 }], recipes, 0);
    expect(missingRecipes).toEqual(['NOPE']);
    expect(materials).toEqual([]);
  });

  it('nets against what the workshops hold and what is on order', () => {
    const { materials } = explode([{ sku: 'ALM-K', qty: 100 }], recipes, 0);
    const netted = net(materials, new Map([['PLUMA', 20]]), new Map([['DOWN-770', 50]]));
    const pluma = netted.find((x) => x.sku === 'PLUMA')!;
    const down = netted.find((x) => x.sku === 'DOWN-770')!;
    expect(pluma.shortage).toBeCloseTo(37.2 - 20, 3);
    expect(down.shortage).toBeCloseTo(60.8 - 50, 3);
    expect(netted.find((x) => x.sku === 'FUNDA-ALM')!.shortage).toBe(100);
  });
});
