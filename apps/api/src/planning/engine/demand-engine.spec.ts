import {
  buildSeries, classifyPattern, classifyAbc, baseForecast, demandOverDays, roundToMoq, coverageDays, evaluateSku,
  EngineParams, MonthPoint, SkuInput,
} from './demand-engine.js';

const monthKeys = [
  '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
];
const params: EngineParams = {
  monthKeys, baseWeight12m: 0.5, growthDefault: 0.3, growthByCategory: {}, seasonalFactors: { '12': 2.4, '01': 1.7 },
  ssMonthsImported: 4, ssMonthsNational: 1, zByClass: { A: 2.05, B: 1.65, C: 1.28 }, reviewDays: 30, nationalLeadTimeDays: 30,
  moqMaxCoverageMonths: 18, overstockExtraMonths: 2, phaseOutMonths: 6, newSkuMonths: 3, yoyAlertPct: 0.5,
};
const pt = (month: string, qty: number, net = qty * 1000): MonthPoint => ({ month, qty, qtyNoOutlier: qty, net });
const asOf = new Date(Date.UTC(2026, 8, 17));
const base = (over: Partial<SkuInput> = {}): SkuInput => ({
  sku: 'X', origin: 'imported', category: 'SABANAS', lifecycle: 'active', launchDate: null,
  leadTimeDays: 70, transitDays: 50, cadenceDays: 90, moq: null, orderMultiple: 1, abc: 'A',
  history: [], available: 0, inTransit: [], asOf, ...over,
});

describe('buildSeries', () => {
  it('starts at the first sale, not at the window start', () => {
    const { series, firstSaleMonth } = buildSeries([pt('2026-03', 5), pt('2026-05', 2)], monthKeys, null);
    expect(firstSaleMonth).toBe('2026-03');
    expect(series.map((p) => p.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    expect(series.map((p) => p.qty)).toEqual([5, 0, 2, 0, 0, 0]);
  });

  it('honours an earlier launch date', () => {
    const { series } = buildSeries([pt('2026-03', 5)], monthKeys, new Date(Date.UTC(2026, 0, 10)));
    expect(series[0].month).toBe('2026-01');
  });
});

describe('classifyPattern', () => {
  it('reads the Syntetos-Boylan quadrants', () => {
    const smooth = monthKeys.map((m) => pt(m, 20));
    expect(classifyPattern(smooth)).toBe('smooth');
    const intermittent = monthKeys.map((m, i) => pt(m, i % 3 === 0 ? 4 : 0));
    expect(classifyPattern(intermittent)).toBe('intermittent');
    const lumpy = monthKeys.map((m, i) => pt(m, i % 4 === 0 ? (i % 8 === 0 ? 50 : 2) : 0));
    expect(classifyPattern(lumpy)).toBe('lumpy');
  });
});

describe('classifyAbc', () => {
  it('cuts at 80 % and 95 % of net', () => {
    const abc = classifyAbc(new Map([['a', 800], ['b', 150], ['c', 50], ['d', 0]]));
    expect(abc.get('a')).toBe('A');
    expect(abc.get('b')).toBe('B');
    expect(abc.get('c')).toBe('C');
    expect(abc.get('d')).toBe('C');
  });
});

describe('baseForecast', () => {
  it('blends the 12- and 6-month averages', () => {
    const series = monthKeys.map((m, i) => pt(m, i < 14 ? 10 : 20)); // last 6 months at 20
    // last 12: 6×10 + 6×20 = 15; last 6: 20 → 0.5·15 + 0.5·20 = 17.5
    expect(baseForecast(series, params)).toBeCloseTo(17.5);
  });

  it('returns null under three months with sales (new SKU)', () => {
    expect(baseForecast([pt('2026-07', 4), pt('2026-08', 6)], params)).toBeNull();
  });

  it('uses the plain average under six months of history', () => {
    const { series } = buildSeries([pt('2026-04', 4), pt('2026-05', 2), pt('2026-06', 6)], monthKeys, null);
    expect(baseForecast(series, params)).toBeCloseTo(12 / 5); // apr..aug = 5 months
  });
});

describe('demandOverDays and rounding', () => {
  it('applies the seasonal factor of each month it crosses', () => {
    // 30 days from 1 Dec at base 10, growth 0, December ×2.4 → 24
    expect(demandOverDays(10, 0, new Date(Date.UTC(2026, 11, 1)), 30, params.seasonalFactors)).toBeCloseTo(10 * 2.4 * (30 / 30));
    // 61 days from 1 Nov: Nov (30 d ×1) + Dec (31 d ×2.4)
    expect(demandOverDays(10, 0, new Date(Date.UTC(2026, 10, 1)), 61, params.seasonalFactors)).toBeCloseTo(10 + 10 * 2.4 * (31 / 30));
  });

  it('rounds up to the multiple and never below the MOQ', () => {
    expect(roundToMoq(0, 500, 10)).toBe(0);
    expect(roundToMoq(3, 500, 1)).toBe(500);
    expect(roundToMoq(23, null, 10)).toBe(30);
  });
});

describe('coverageDays', () => {
  it('counts arrivals on their ETA', () => {
    // 10/month → 1/3 per day; 5 on hand covers 15 days; 30 arriving on day 10 extends it.
    const without = coverageDays(5, [], 0, 10, 0, asOf, {});
    const withArrival = coverageDays(5, [{ qty: 30, eta: new Date(asOf.getTime() + 10 * 86400000) }], 0, 10, 0, asOf, {});
    expect(without).toBe(15);
    expect(withArrival).toBeGreaterThan(without! + 80);
  });
});

describe('evaluateSku', () => {
  const steady = monthKeys.map((m) => pt(m, 30));

  it('the quantity is target minus position, not target plus a month', () => {
    const r = evaluateSku(base({ history: steady, available: 65, inTransit: [{ qty: 63, eta: null }] }), params);
    expect(r.suggested).toBeCloseTo(Math.max(0, r.target - 128), 1);
    expect(r.position).toBe(128);
  });

  it('safety stock follows the months rule and keeps the statistical value as a reference', () => {
    const r = evaluateSku(base({ history: steady }), params);
    expect(r.ssRule).toBeCloseTo(30 * 1.3 * 4, 1);
    expect(r.ss).toBe(r.ssRule);
    expect(r.ssStat).not.toBeNull();
  });

  it('flags a MOQ that covers more than the horizon instead of hiding it', () => {
    const small = monthKeys.map((m) => pt(m, 3));
    const r = evaluateSku(base({ history: small, moq: 500 }), params);
    expect(r.rounded).toBe(500);
    expect(r.moqExceedsHorizon).toBe(true);
  });

  it('transit arriving after the horizon does not cover the gap', () => {
    const far = new Date(asOf.getTime() + 400 * 86400000);
    const r = evaluateSku(base({ history: steady, inTransit: [{ qty: 1000, eta: far }] }), params);
    expect(r.inTransit).toBe(0);
    expect(r.inTransitLate).toBe(1000);
  });

  it('states: new, no sales with stock, breach, reorder, ok, overstock', () => {
    expect(evaluateSku(base({ history: [pt('2026-08', 5)] }), params).state).toBe('NUEVO');
    expect(evaluateSku(base({ history: [], available: 40 }), params).state).toBe('SIN_VENTA');
    expect(evaluateSku(base({ history: steady, available: 10 }), params).state).toBe('QUIEBRE');
    const r = evaluateSku(base({ history: steady, available: 0 }), params);
    expect(evaluateSku(base({ history: steady, available: Math.floor(r.rop) }), params).state).toBe('REPONER');
    expect(evaluateSku(base({ history: steady, available: Math.ceil(r.target) + 1 }), params).state).toBe('OK');
    expect(evaluateSku(base({ history: steady, available: Math.ceil(r.target) + 1000 }), params).state).toBe('SOBRE_STOCK');
  });

  it('intermittent demand gets a min/max in units', () => {
    const inter = monthKeys.map((m, i) => pt(m, i % 3 === 0 ? 6 : 0));
    const r = evaluateSku(base({ history: inter }), params);
    expect(r.pattern).toBe('intermittent');
    expect(r.ss).toBe(6);
    expect(r.reasons.join(' ')).toContain('intermitente');
  });

  it('year-over-year is reported and alerts, but the forecast comes from the average', () => {
    // The window ends in August; the month being forecast is September.
    const hist = monthKeys.map((m) => pt(m, m === '2025-09' ? 100 : 20));
    const r = evaluateSku(base({ history: hist }), params);
    expect(r.yoy.month).toBe('2026-09');
    expect(r.yoy.lastYear).toBe(100);
    expect(r.yoy.alert).toBe(true);
    expect(r.demandNext).toBeLessThan(50); // not pulled up by last October
  });

  it('phase-out and discontinued never suggest a purchase', () => {
    expect(evaluateSku(base({ history: steady, lifecycle: 'phase_out' }), params).rounded).toBe(0);
    expect(evaluateSku(base({ history: steady, lifecycle: 'discontinued' }), params).state).toBe('DESCONTINUADO');
  });
});
