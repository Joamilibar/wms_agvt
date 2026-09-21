import { BadRequestException } from '@nestjs/common';
import { SheetingCalcService, fabricPricePerLinearMetre } from './sheeting-calc.service.js';
import { ENCIMERA_CRUCERO, REFERENCE_FABRICS } from './reference-models.js';

type Lot = { unitCost: number; costSyncedAt: Date | null; entryDate: Date; sku?: string };
type Rate = { workshop: string; modelCode: string; sizeLabel: string | null; quality?: string | null; rate: number; version: number };

/** Minimal stand-ins for the Mongoose models the service reads. */
function build(lots: Lot[], rates: Rate[], params: Record<string, unknown> = {}) {
  const query = <T>(rows: T[]) => ({ sort: () => ({ exec: () => Promise.resolve(rows[0] ?? null) }), exec: () => Promise.resolve(rows) });
  const forSku = (f: { sku?: string }) => lots.filter((l) => !l.sku || !f.sku || l.sku === f.sku);
  const stockModel = {
    find: (f: { sku?: string }) => query(forSku(f)),
    findOne: (f: { sku?: string }) => query(forSku(f)),
  };
  // Same resolution order as WorkshopRatesService: (size, quality) → (size) → (quality) → (model).
  const ratesSvc = {
    resolve: (_w: string, _m: string, sizeLabel: string | null, quality: string | null) => {
      const tries: [string | null, string | null][] = [[sizeLabel, quality], [sizeLabel, null], [null, quality], [null, null]];
      for (const [sz, q] of tries) {
        const hit = rates.find((r) => r.sizeLabel === sz && (r.quality ?? null) === q);
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(null);
    },
  };
  const fabric = { ...REFERENCE_FABRICS[0], bsaleVariantId: null, isActive: true };
  const colour = { ...fabric, sku: 'COLOR-290', name: 'Tela color 290', rollWidthCm: 290 };
  const model = { ...ENCIMERA_CRUCERO, version: 1, supplies: [], blocks: [] };
  const masters = {
    model: () => Promise.resolve(model),
    fabric: (sku: string) => Promise.resolve(sku === colour.sku ? colour : fabric),
    fabrics: () => Promise.resolve([fabric, colour]),
  };
  const paramsSvc = { current: () => Promise.resolve({ version: 1, cuttingScrapPct: 0.03, defaultCutBatchUnits: 20, fabricCostStaleDays: 45, marginByChannel: { tienda: 3 }, vatRate: 0.19, ...params }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return new SheetingCalcService(stockModel as any, ratesSvc as any, masters as any, paramsSvc as any);
}

const input = { modelCode: 'ENCIMERA_CRUCERO', fabricSku: '63845371893523', measures: { A: 255, L: 290 }, qty: 20, workshop: 'Taller', channel: 'tienda', sizeLabel: 'Queen' };
const fresh: Lot = { unitCost: 5364, costSyncedAt: new Date(), entryDate: new Date() };
const queenRate: Rate = { workshop: 'Taller', modelCode: 'ENCIMERA_CRUCERO', sizeLabel: 'Queen', rate: 14000, version: 1 };

describe('sheeting quote (spec invariants 10–11)', () => {
  it('10 · without a workshop rate there is no quote: NO_WORKSHOP_RATE, never zero', async () => {
    const svc = build([fresh], []);
    await expect(svc.quote(input)).rejects.toMatchObject({ response: { details: { code: 'NO_WORKSHOP_RATE', workshop: 'Taller' } } });
  });

  it('resolves the most specific rate: size + quality beats size, beats quality, beats the model-wide rate', async () => {
    const model = { ...queenRate, sizeLabel: null, quality: null, rate: 10000 };
    const byQuality = { ...queenRate, sizeLabel: null, quality: '500TC', rate: 11000 };
    const bySize = { ...queenRate, quality: null, rate: 12000 };
    const exact = { ...queenRate, quality: '500TC', rate: 14000 };
    expect((await build([fresh], [model]).quote(input)).cost.labour).toBe(10000);
    expect((await build([fresh], [model, byQuality]).quote(input)).cost.labour).toBe(11000);
    expect((await build([fresh], [model, byQuality, bySize]).quote(input)).cost.labour).toBe(12000);
    expect((await build([fresh], [model, byQuality, bySize, exact]).quote(input)).cost.labour).toBe(14000);
    // The quality comes from the base fabric (500TC here), not from the request.
    const q = await build([fresh], [{ ...exact, quality: '800TC', rate: 16000 }, model]).quote(input);
    expect(q.cost.labour).toBe(10000);
  });

  it('11 · a cost older than the window is declared stale, with its date, never a silent zero', async () => {
    const old = new Date(Date.now() - 60 * 86400000);
    const svc = build([{ unitCost: 5364, costSyncedAt: old, entryDate: old }], [queenRate]);
    const q = await svc.quote(input);
    expect(q.fabricCost.costSource).toBe('stale');
    expect(q.fabricCost.costSyncedAt).toEqual(old);
    expect(q.fabricCost.pricePerLinearMetre).toBe(5364);
    expect(q.warnings.some((w) => w.startsWith('FABRIC_COST_STALE'))).toBe(true);
  });

  it('a fabric with no cost at all is an error, not a zero', async () => {
    const svc = build([], [queenRate]);
    await expect(svc.quote(input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.quote(input)).rejects.toMatchObject({ response: { details: { code: 'NO_FABRIC_COST' } } });
  });

  it('reference quote: Queen crucero on the 305 roll at $5.364/ml, batch 20 → 3.63 ml (centre 2.29 + frame 1.34)', async () => {
    const svc = build([fresh], [queenRate], { cuttingScrapPct: 0 });
    const q = await svc.quote(input);
    expect(q.pieces.map((x) => [x.role, x.orientation, x.linearMetresPerUnit])).toEqual([
      ['centro', 'contrahilo', 2.29],
      ['marco_lateral', 'al_hilo', 0.96], // 2 strips of 320, 7 across: a batch of 20 units is 40 strips = 6 rows → 0.48 each
      ['marco_superior', 'contrahilo', 0.38],
    ]);
    expect(q.consumption.linearMetresPerUnit).toBeCloseTo(3.63, 4);
    expect(q.cost.fabric).toBe(q.fabrics.reduce((a, f) => a + f.fabricClp, 0)); // rounded per fabric, then summed
    // The sheet's area method on the same pieces; the real cost is what the roll charges for.
    expect(q.theoretical.fabric).toBeLessThan(q.cost.fabric);
    expect(q.cost.total).toBe(q.cost.fabric + 14000 + ENCIMERA_CRUCERO.packagingClp + ENCIMERA_CRUCERO.freightClp);
    expect(q.price.netPvp).toBe(q.cost.total * 3);
    expect(q.fabrics.map((f) => f.slot)).toEqual(['base', 'marco']);
    expect(q.fabrics[1].sku).toBe(q.fabrics[0].sku); // no frame fabric given: same as the centre
  });

  it('a coloured frame is cut and priced on its own fabric, roll width included', async () => {
    const svc = build([{ ...fresh, sku: '63845371893523' }, { ...fresh, unitCost: 9000, sku: 'COLOR-290' }], [queenRate], { cuttingScrapPct: 0 });
    const q = await svc.quote({ ...input, frameFabricSku: 'COLOR-290' });
    const marco = q.fabrics.find((f) => f.slot === 'marco')!;
    expect(marco.sku).toBe('COLOR-290');
    expect(marco.rollWidthCm).toBe(290);
    expect(marco.cost.pricePerLinearMetre).toBe(9000);
    expect(marco.consumption.linearMetresPerUnit).toBeCloseTo(0.96 + 0.38, 4); // 288 usable: still 7 strips across
    expect(q.cost.fabric).toBe(q.fabrics[0].fabricClp + marco.fabricClp);
    expect(q.pieces.find((x) => x.role === 'centro')!.fabricSku).toBe('63845371893523');
    expect(q.pieces.find((x) => x.role === 'marco_lateral')!.fabricSku).toBe('COLOR-290');
  });

  it('cutting scrap is applied on the metres, on top of the nesting waste', async () => {
    const svc = build([fresh], [queenRate], { cuttingScrapPct: 0.03 });
    const q = await svc.quote(input);
    expect(q.consumption.linearMetresWithScrapPerUnit).toBeCloseTo(3.63 * 1.03, 3);
    expect(q.cost.fabric).toBe(q.fabrics.reduce((a, f) => a + Math.round(f.consumption.linearMetresWithScrapPerUnit * 5364), 0));
  });

  it('with the real geometry the size does change the metres: the centre no longer spans the roll', async () => {
    const svc = build([fresh], [queenRate]);
    const single = await svc.quote({ ...input, measures: { A: 190, L: 290 } });
    const king = await svc.quote({ ...input, measures: { A: 280, L: 290 } });
    // Centre 164×279 and 254×279 both turn (279 across) and advance their width: 1.64 vs 2.54 ml.
    expect(single.pieces[0].linearMetresPerUnit).toBeCloseTo(1.64, 4);
    expect(king.pieces[0].linearMetresPerUnit).toBeCloseTo(2.54, 4);
    expect(single.consumption.linearMetresPerUnit).toBeLessThan(king.consumption.linearMetresPerUnit);
  });

  it('SuperKing: the real centre (274×279) fits the 305 roll; a piece wider than the roll fails with the widths involved', async () => {
    const svc = build([fresh], [queenRate]);
    const sk = await svc.quote({ ...input, measures: { A: 300, L: 290 } });
    expect(sk.pieces[0]).toMatchObject({ widthCm: 274, lengthCm: 279, orientation: 'contrahilo' });
    await expect(svc.quote({ ...input, measures: { A: 340, L: 340 } })).rejects.toMatchObject({
      response: { details: { code: 'FABRIC_TOO_NARROW', slot: 'base', role: 'centro', requiredWidthCm: 314, availableWidthCm: 303 } },
    });
  });

  it('the unit conversion of the fabric cost lives in one place (assumes per linear metre)', () => {
    expect(fabricPricePerLinearMetre(5364, { rollWidthCm: 305 })).toBe(5364);
  });
});
