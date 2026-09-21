/**
 * Material requirements as pure functions: explode what is to be made
 * through its recipe (and the recipes of its components, level by level),
 * add scrap, and net the result against what the workshops hold and what
 * is on order.
 *
 * Always the *net* need, never a minimum purchase: the spreadsheet asked
 * for feathers for 20 featherbeds when 2.4 were needed (hallazgo M4/N7).
 */

export type Uom = 'un' | 'kg' | 'm';

export interface Recipe {
  parentSku: string;
  version: number;
  components: { sku: string; name: string; qty: number; uom: Uom; scrapPct: number | null }[];
}

export interface Requirement {
  sku: string;
  name: string;
  uom: Uom;
  required: number;
  /** Deepest level at which the SKU appears (0 = requested product). */
  level: number;
  /** Which requested products drove this requirement. */
  from: { parentSku: string; qty: number }[];
}

export interface NettedRequirement extends Requirement {
  available: number;
  onOrder: number;
  shortage: number;
}

/**
 * Explodes the requested products. A component with its own recipe is an
 * intermediate: it is exploded further and also reported (level ≥ 1) so
 * the workshop knows it has to be made first.
 */
export function explode(
  requests: { sku: string; qty: number }[],
  recipes: Map<string, Recipe>,
  defaultScrap: number,
  maxDepth = 6,
): { materials: Requirement[]; intermediates: Requirement[]; missingRecipes: string[] } {
  const materials = new Map<string, Requirement>();
  const intermediates = new Map<string, Requirement>();
  const missing = new Set<string>();

  const add = (map: Map<string, Requirement>, sku: string, name: string, uom: Uom, qty: number, level: number, root: { parentSku: string; qty: number }) => {
    const cur = map.get(sku) ?? { sku, name, uom, required: 0, level, from: [] };
    cur.required += qty;
    cur.level = Math.max(cur.level, level);
    const f = cur.from.find((x) => x.parentSku === root.parentSku);
    if (f) f.qty += root.qty; else cur.from.push({ ...root });
    if (!cur.name && name) cur.name = name;
    map.set(sku, cur);
  };

  const walk = (sku: string, qty: number, level: number, root: { parentSku: string; qty: number }) => {
    const recipe = recipes.get(sku);
    if (!recipe) { if (level === 0) missing.add(sku); return; }
    for (const c of recipe.components) {
      // Scrap is a property of fillings and fabric; a cover is either used or not.
      const scrap = c.scrapPct ?? (c.uom === 'un' ? 0 : defaultScrap);
      const need = qty * c.qty * (1 + scrap);
      if (recipes.has(c.sku) && level + 1 < maxDepth) {
        add(intermediates, c.sku, c.name, c.uom, need, level + 1, root);
        walk(c.sku, need, level + 1, root);
      } else {
        add(materials, c.sku, c.name, c.uom, need, level + 1, root);
      }
    }
  };

  for (const r of requests) {
    if (r.qty <= 0) continue;
    walk(r.sku, r.qty, 0, { parentSku: r.sku, qty: r.qty });
  }
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const finish = (m: Map<string, Requirement>) => [...m.values()].map((x) => ({ ...x, required: round(x.required), from: x.from.map((f) => ({ ...f, qty: round(f.qty) })) }));
  return { materials: finish(materials), intermediates: finish(intermediates), missingRecipes: [...missing] };
}

/** Requirement minus what is on hand at the workshops and what is on order. */
export function net(reqs: Requirement[], available: Map<string, number>, onOrder: Map<string, number>): NettedRequirement[] {
  return reqs.map((r) => {
    const av = available.get(r.sku) ?? 0;
    const oo = onOrder.get(r.sku) ?? 0;
    return { ...r, available: av, onOrder: oo, shortage: Math.max(0, Math.round((r.required - av - oo) * 1000) / 1000) };
  });
}
