import { BadRequestException } from '@nestjs/common';
import { SheetingCalcService, fabricPricePerLinearMetre } from './sheeting-calc.service.js';
import { ENCIMERA_CRUCERO, REFERENCE_FABRICS } from './reference-models.js';

type Lot = { unitCost: number; costSyncedAt: Date | null; entryDate: Date };
type Rate = { workshop: string; modelCode: string; sizeLabel: string | null; rate: number; version: number };

/** Minimal stand-ins for the Mongoose models the service reads. */
function build(lots: Lot[], rates: Rate[], params: Record<string, unknown> = {}) {
  const query = <T>(rows: T[]) => ({ sort: () => ({ exec: () => Promise.resolve(rows[0] ?? null) }), exec: () => Promise.resolve(rows) });
  const stockModel = {
    find: () => query(lots),
    findOne: () => query(lots),
  };
  const rateModel = {
    findOne: (f: { sizeLabel: string | null }) => query(rates.filter((r) => r.sizeLabel === f.sizeLabel)),
  };
  const fabric = { ...REFERENCE_FABRICS[0], bsaleVariantId: null, isActive: true };
  const model = { ...ENCIMERA_CRUCERO, version: 1, supplies: [], blocks: [] };
  const masters = { model: () => Promise.resolve(model), fabric: () => Promise.resolve(fabric), fabrics: () => Promise.resolve([fabric]) };
  const paramsSvc = { current: () => Promise.resolve({ version: 1, cuttingScrapPct: 0.03, defaultCutBatchUnits: 20, fabricCostStaleDays: 45, marginByChannel: { tienda: 3 }, vatRate: 0.19, ...params }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return new SheetingCalcService(stockModel as any, rateModel as any, masters as any, paramsSvc as any);
}

const input = { modelCode: 'ENCIMERA_CRUCERO', fabricSku: '63845371893523', measures: { A: 255, L: 290 }, qty: 20, workshop: 'Taller', channel: 'tienda', sizeLabel: 'Queen' };
const fresh: Lot = { unitCost: 5364, costSyncedAt: new Date(), entryDate: new Date() };
const queenRate: Rate = { workshop: 'Taller', modelCode: 'ENCIMERA_CRUCERO', sizeLabel: 'Queen', rate: 14000, version: 1 };

describe('sheeting quote (spec invariants 10–11)', () => {
  it('10 · without a workshop rate there is no quote: NO_WORKSHOP_RATE, never zero', async () => {
    const svc = build([fresh], []);
    await expect(svc.quote(input)).rejects.toMatchObject({ response: { details: { code: 'NO_WORKSHOP_RATE', workshop: 'Taller' } } });
  });

  it('falls back from the size to the model-wide rate', async () => {
    const svc = build([fresh], [{ ...queenRate, sizeLabel: null, rate: 12000 }]);
    const q = await svc.quote(input);
    expect(q.cost.labour).toBe(12000);
    expect(q.labourRate.sizeLabel).toBeNull();
  });

  it('11 · a cost older than the window is declared stale, with its date, never a silent zero', async () => {
    const old = new Date(Date.now() - 60 * 86400000);
    const svc = build([{ unitCost: 5364, costSyncedAt: old, entryDate: old }], [queenRate]);
    const q = await svc.quote(input);
    expect(q.fabricCost.costSource).toBe('stale');
    expect(q.fabricCost.costSyncedAt).toEqual(old);
    expect(q.fabricCost.pricePerLinearMetre).toBe(5364);
    expect(q.warnings).toContain('FABRIC_COST_STALE');
  });

  it('a fabric with no cost at all is an error, not a zero', async () => {
    const svc = build([], [queenRate]);
    await expect(svc.quote(input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.quote(input)).rejects.toMatchObject({ response: { details: { code: 'NO_FABRIC_COST' } } });
  });

  it('reference quote: Queen encimera on the 305 roll at $5.364/ml → 3.09 ml, $16.575 before cutting scrap', async () => {
    const svc = build([fresh], [queenRate], { cuttingScrapPct: 0 });
    const q = await svc.quote(input);
    expect(q.consumption.linearMetresPerUnit).toBeCloseTo(3.09, 4);
    expect(q.pieces[0].orientation).toBe('al_hilo');
    expect(q.cost.fabric).toBe(16575);
    // The sheet's area method gives $14.292: the real cost is 16 % higher for a Queen.
    expect(q.theoretical.fabric).toBe(14292);
    expect(q.theoretical.deltaPct).toBeCloseTo(0.16, 2);
    expect(q.cost.total).toBe(16575 + 14000 + ENCIMERA_CRUCERO.packagingClp + ENCIMERA_CRUCERO.freightClp);
    expect(q.price.netPvp).toBe(q.cost.total * 3);
  });

  it('cutting scrap is applied on the metres, on top of the nesting waste', async () => {
    const svc = build([fresh], [queenRate], { cuttingScrapPct: 0.03 });
    const q = await svc.quote(input);
    expect(q.consumption.linearMetresWithScrapPerUnit).toBeCloseTo(3.09 * 1.03, 4);
    expect(q.cost.fabric).toBe(Math.round(3.09 * 1.03 * 5364));
  });

  it('a Single wastes 35 % and is flagged; the metres are the same as a King', async () => {
    const svc = build([fresh], [queenRate]);
    const single = await svc.quote({ ...input, measures: { A: 190, L: 290 } });
    const king = await svc.quote({ ...input, measures: { A: 280, L: 290 } });
    expect(single.consumption.linearMetresPerUnit).toBe(king.consumption.linearMetresPerUnit);
    expect(single.warnings).toContain('WASTE_ABOVE_25');
    expect(king.warnings).not.toContain('WASTE_ABOVE_25');
  });

  it('SuperKing on the 305 roll fails with FABRIC_TOO_NARROW and the widths involved', async () => {
    const svc = build([fresh], [queenRate]);
    await expect(svc.quote({ ...input, measures: { A: 300, L: 290 } })).rejects.toMatchObject({
      response: { details: { code: 'FABRIC_TOO_NARROW', requiredWidthCm: 308, availableWidthCm: 303 } },
    });
  });

  it('the unit conversion of the fabric cost lives in one place (assumes per linear metre)', () => {
    expect(fabricPricePerLinearMetre(5364, { rollWidthCm: 305 })).toBe(5364);
  });
});
