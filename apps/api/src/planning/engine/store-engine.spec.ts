import { computedIdeal, dailySeries, deliveriesFor, evaluateStoreSku, StoreParams, StoreSkuInput } from './store-engine.js';

const p: StoreParams = {
  cycleDays: 7, deliveryDays: 2, displayMin: { A: 1, B: 1, C: 0 }, demandWindowDays: 90, splitDeliveryUnits: 60,
  withdrawAfterMonths: 6, zByClass: { A: 2.05, B: 1.65, C: 1.28 },
};
const base = (over: Partial<StoreSkuInput> = {}): StoreSkuInput => ({
  sku: 'X', abc: 'A', dailySales: [], soldRecently: 0, manualIdeal: null, stockStore: 0, inTransitToStore: 0, availableSource: 100, ...over,
});
// 45 units over 90 days, one every other day.
const steady = Array.from({ length: 45 }, (_, i) => ({ date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}-${i}`, qty: 1 }));

describe('store engine (D10)', () => {
  it('fills the window with zeros for the days without a sale', () => {
    const s = dailySeries([{ date: 'd1', qty: 3 }, { date: 'd1', qty: 2 }, { date: 'd2', qty: 1 }], 10);
    expect(s).toHaveLength(10);
    expect(s.filter((x) => x > 0)).toEqual([5, 1]);
  });

  it('the computed ideal covers cycle + delivery plus safety plus the display minimum', () => {
    const { ideal, displayMin } = computedIdeal(0.5, 0.5, 'A', p);
    // 0.5 × 9 = 4.5 demand + 2.05 × 0.5 × 3 ≈ 3.1 safety → ceil 8, + 1 display
    expect(displayMin).toBe(1);
    expect(ideal).toBe(9);
    expect(computedIdeal(0, 0, 'A', p).ideal).toBe(0);
  });

  it('a manual ideal wins and is kept as such', () => {
    const r = evaluateStoreSku(base({ dailySales: steady, manualIdeal: { ideal: 4, displayMin: 2 }, stockStore: 1 }), p);
    expect(r.idealSource).toBe('manual');
    expect(r.ideal).toBe(4);
    expect(r.need).toBe(3);
    expect(r.send).toBe(3);
    expect(r.state).toBe('ENVIAR');
  });

  it('sends what is missing without exceeding the warehouse, and never "warehouse minus store"', () => {
    const r = evaluateStoreSku(base({ manualIdeal: { ideal: 6, displayMin: 0 }, stockStore: 2, availableSource: 5, soldRecently: 3 }), p);
    expect(r.need).toBe(4);
    expect(r.send).toBe(4); // the spreadsheet sent 3 (5 − 2)
    const r2 = evaluateStoreSku(base({ manualIdeal: { ideal: 6, displayMin: 0 }, stockStore: 2, availableSource: 3, soldRecently: 3 }), p);
    expect(r2.send).toBe(3);
    expect(r2.reasons.join(' ')).toContain('solo cubre 3 de 4');
  });

  it('what is already on its way to the store is not asked for again', () => {
    const r = evaluateStoreSku(base({ manualIdeal: { ideal: 6, displayMin: 0 }, stockStore: 2, inTransitToStore: 4, soldRecently: 3 }), p);
    expect(r.need).toBe(0);
    expect(r.state).toBe('OK');
  });

  it('a shortage the warehouse cannot cover is flagged for purchasing, not hidden as "sin stock"', () => {
    const r = evaluateStoreSku(base({ manualIdeal: { ideal: 6, displayMin: 0 }, stockStore: 1, availableSource: 0, soldRecently: 3 }), p);
    expect(r.state).toBe('FALTANTE_SIN_RESPALDO');
    expect(r.need).toBe(5);
  });

  it('proposes a withdrawal of stock above the ideal when nothing sold in six months', () => {
    const r = evaluateStoreSku(base({ manualIdeal: { ideal: 10, displayMin: 0 }, stockStore: 29, soldRecently: 0 }), p);
    expect(r.state).toBe('RETIRO');
    expect(r.withdraw).toBe(19);
  });

  it('a SKU with sales but no ideal gets a computed one and is marked so', () => {
    const r = evaluateStoreSku(base({ dailySales: steady, stockStore: 0 }), p);
    expect(r.idealSource).toBe('computed');
    expect(r.ideal).toBeGreaterThan(0);
    expect(r.state).toBe('ENVIAR');
  });

  it('a SKU with neither sales nor ideal is left alone', () => {
    expect(evaluateStoreSku(base(), p).state).toBe('SIN_IDEAL');
  });

  it('splits the week in two deliveries above the volume threshold', () => {
    expect(deliveriesFor(40, p)).toBe(1);
    expect(deliveriesFor(61, p)).toBe(2);
  });
});
