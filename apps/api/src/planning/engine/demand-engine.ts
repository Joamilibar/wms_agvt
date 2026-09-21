/**
 * The demand engine as pure functions: no database, no dates from the
 * clock. Everything it needs comes in as arguments so a run is reproducible
 * from its snapshot and every rule is testable on its own.
 *
 * Rules fixed with the client (Sept 2026):
 *  - D2  the year-over-year comparison is shown and alerts; it never multiplies
 *  - D3  growth 30 % global, overridable by category
 *  - D4  safety stock = months of demand by origin; the statistical value is a reference
 *  - D7  MOQ per SKU, multiple 1, flagged when it covers more than the horizon
 */

export type Pattern = 'smooth' | 'erratic' | 'intermittent' | 'lumpy';
export type AbcClass = 'A' | 'B' | 'C';
export type SkuState =
  | 'NUEVO' | 'SIN_VENTA' | 'QUIEBRE' | 'REPONER' | 'OK' | 'SOBRE_STOCK' | 'PHASE_OUT' | 'DESCONTINUADO';

export interface MonthPoint { month: string; qty: number; qtyNoOutlier: number; net: number }

export interface EngineParams {
  monthKeys: string[];            // the window, oldest first
  baseWeight12m: number;
  growthDefault: number;
  growthByCategory: Record<string, number>;
  seasonalFactors: Record<string, number>; // '01'..'12' → factor, missing = 1
  ssMonthsImported: number;
  ssMonthsNational: number;
  zByClass: Record<string, number>;
  reviewDays: number;
  nationalLeadTimeDays: number;
  moqMaxCoverageMonths: number;
  overstockExtraMonths: number;
  phaseOutMonths: number;
  newSkuMonths: number;
  yoyAlertPct: number;
}

export interface SkuInput {
  sku: string;
  origin: 'imported' | 'national' | 'raw_material' | 'supply' | 'pack' | 'service' | 'unknown';
  category: string;
  lifecycle: 'new' | 'active' | 'phase_out' | 'discontinued';
  launchDate: Date | null;
  leadTimeDays: number | null;
  transitDays: number | null;
  cadenceDays: number | null;
  moq: number | null;
  orderMultiple: number;
  abc: AbcClass;
  /** Retail history inside the window, one point per month that had any line. */
  history: MonthPoint[];
  available: number;
  /** Pending purchase-order quantity with its ETA (null = unknown, counts anyway). */
  inTransit: { qty: number; eta: Date | null }[];
  /** Date of the run; "next month" and horizons are counted from here. */
  asOf: Date;
  /** Extra factor per concrete month ('YYYY-MM') from demand events matching this SKU; missing = 1. */
  eventFactors?: Record<string, number>;
}

export interface SkuResult {
  sku: string;
  abc: AbcClass;
  pattern: Pattern | null;
  lifecycle: SkuInput['lifecycle'];
  monthsOfData: number;
  monthsWithSales: number;
  firstSaleMonth: string | null;
  base: number | null;
  seasonalNext: number;
  growth: number;
  /** Forecast for the coming month. */
  demandNext: number;
  /** Average monthly demand over the coming lead time + review, used for ratios. */
  demandMonthly: number;
  sigma: number;
  leadTimeDays: number;
  ssRule: number;
  ssStat: number | null;
  ss: number;
  rop: number;
  target: number;
  available: number;
  inTransit: number;
  inTransitLate: number;
  position: number;
  suggested: number;
  rounded: number;
  moqExceedsHorizon: boolean;
  coverageDays: number | null;
  coverageMonths: number | null;
  yoy: { month: string; lastYear: number | null; forecast: number; deltaPct: number | null; alert: boolean };
  state: SkuState;
  reasons: string[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const mk = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return mk(d);
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

/**
 * The monthly series from the first sale (or the launch date) to the end of
 * the window; months without sales are zero. Nothing before the first sale:
 * a SKU launched in March is not divided by the twelve months it did not exist.
 */
export function buildSeries(history: MonthPoint[], monthKeys: string[], launchDate: Date | null): { series: MonthPoint[]; firstSaleMonth: string | null } {
  const byMonth = new Map(history.map((h) => [h.month, h]));
  const sold = monthKeys.filter((m) => (byMonth.get(m)?.qty ?? 0) > 0);
  let start: string | null = sold[0] ?? null;
  if (launchDate) {
    const lm = mk(launchDate);
    if (!start || lm < start) start = lm;
  }
  if (!start) return { series: [], firstSaleMonth: null };
  const series = monthKeys
    .filter((m) => m >= start!)
    .map((m) => byMonth.get(m) ?? { month: m, qty: 0, qtyNoOutlier: 0, net: 0 });
  return { series, firstSaleMonth: sold[0] ?? null };
}

/** Syntetos-Boylan quadrant on the average interval between sales and the CV² of the sale sizes. */
export function classifyPattern(series: MonthPoint[]): Pattern | null {
  const sizes = series.filter((p) => p.qty > 0).map((p) => p.qty);
  if (sizes.length < 2) return null;
  const adi = series.length / sizes.length;
  const m = mean(sizes);
  const cv2 = m > 0 ? (stdev(sizes) / m) ** 2 : 0;
  if (adi < 1.32) return cv2 < 0.49 ? 'smooth' : 'erratic';
  return cv2 < 0.49 ? 'intermittent' : 'lumpy';
}

/** ABC over net retail sales: A up to 80 % of the total, B up to 95 %, C the rest. */
export function classifyAbc(netBySku: Map<string, number>): Map<string, AbcClass> {
  const rows = [...netBySku.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  const out = new Map<string, AbcClass>();
  let acc = 0;
  for (const [sku, n] of rows) {
    acc += n;
    out.set(sku, acc / total <= 0.8 ? 'A' : acc / total <= 0.95 ? 'B' : 'C');
  }
  for (const sku of netBySku.keys()) if (!out.has(sku)) out.set(sku, 'C');
  return out;
}

/**
 * Base forecast: the 12-month average from the first sale blended with the
 * 6-month average. Under six months of history, the plain average; under
 * `newSkuMonths` months with sales, nothing — the SKU is new.
 */
export function baseForecast(series: MonthPoint[], params: Pick<EngineParams, 'baseWeight12m' | 'newSkuMonths'>): number | null {
  const withSales = series.filter((p) => p.qty > 0).length;
  if (withSales < params.newSkuMonths) return null;
  const qtys = series.map((p) => p.qty);
  if (qtys.length < 6) return mean(qtys);
  const last12 = mean(qtys.slice(-12));
  const last6 = mean(qtys.slice(-6));
  return params.baseWeight12m * last12 + (1 - params.baseWeight12m) * last6;
}

/**
 * Factor of a concrete month: the calendar seasonality ('12' → 2.4) times
 * any event that covers that month ('2026-11' → 1.5 for a Cyber). Keys of
 * two characters are calendar months, of seven are concrete months.
 */
export function seasonalFor(monthKey: string, factors: Record<string, number>): number {
  return (factors[monthKey.slice(5, 7)] ?? 1) * (factors[monthKey] ?? 1);
}

export function growthFor(category: string, params: Pick<EngineParams, 'growthDefault' | 'growthByCategory'>): number {
  return params.growthByCategory[category] ?? params.growthDefault;
}

/** Demand over `days` starting at `from`, month by month with each month's seasonal factor. */
export function demandOverDays(base: number, growth: number, from: Date, days: number, factors: Record<string, number>): number {
  if (days <= 0 || base <= 0) return 0;
  let total = 0;
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let remaining = days;
  while (remaining > 0) {
    const key = mk(cursor);
    const daysInMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
    const left = daysInMonth - cursor.getUTCDate() + 1;
    const take = Math.min(left, remaining);
    total += (base * seasonalFor(key, factors) * (1 + growth)) * (take / 30);
    remaining -= take;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return total;
}

export function roundToMoq(qty: number, moq: number | null, multiple: number): number {
  if (qty <= 0) return 0;
  const m = Math.max(1, multiple);
  const r = Math.ceil(qty / m) * m;
  return Math.max(r, moq ?? 0);
}

/**
 * Days until the projected stock crosses the safety level: available plus
 * arrivals by ETA, minus daily demand. Null when there is no demand.
 */
export function coverageDays(
  available: number, inTransit: { qty: number; eta: Date | null }[], ss: number,
  base: number, growth: number, asOf: Date, factors: Record<string, number>, cap = 730,
): number | null {
  if (base <= 0) return null;
  let stock = available + inTransit.filter((t) => !t.eta).reduce((s, t) => s + t.qty, 0);
  const arrivals = inTransit.filter((t) => t.eta).map((t) => ({ qty: t.qty, at: t.eta!.getTime() }));
  const day0 = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  for (let d = 0; d < cap; d++) {
    const t = day0 + d * 86400000;
    for (const a of arrivals) if (a.at <= t && a.qty > 0) { stock += a.qty; a.qty = 0; }
    const key = mk(new Date(t));
    stock -= (base * seasonalFor(key, factors) * (1 + growth)) / 30;
    if (stock < ss) return d;
  }
  return cap;
}

// ── the run for one SKU ──────────────────────────────────────────────────────

export function evaluateSku(input: SkuInput, params: EngineParams): SkuResult {
  const reasons: string[] = [];
  const { series, firstSaleMonth } = buildSeries(input.history, params.monthKeys, input.launchDate);
  const monthsWithSales = series.filter((p) => p.qty > 0).length;
  const pattern = classifyPattern(series);
  const growth = growthFor(input.category, params);
  const nextMonth = addMonths(params.monthKeys[params.monthKeys.length - 1], 1);
  const factors = { ...params.seasonalFactors, ...(input.eventFactors ?? {}) };
  const seasonalNext = seasonalFor(nextMonth, factors);
  if (input.eventFactors && Object.keys(input.eventFactors).length) reasons.push(`Eventos aplicados: ${Object.entries(input.eventFactors).map(([m, f]) => `${m} ×${f}`).join(', ')}`);

  const leadTimeDays =
    input.origin === 'imported'
      ? (input.leadTimeDays ?? 0) + (input.transitDays ?? 0)
      : (input.leadTimeDays ?? params.nationalLeadTimeDays);
  if (input.origin === 'imported' && input.leadTimeDays == null) reasons.push('Sin lead time: el punto de reorden es solo la seguridad');
  if (input.origin === 'unknown') reasons.push('Origen sin definir: se evalúa como nacional');

  const base = baseForecast(series, params);
  const demandNext = base === null ? 0 : base * seasonalNext * (1 + growth);
  const horizonDays = leadTimeDays + params.reviewDays;
  const demandMonthly = base === null ? 0 : demandOverDays(base, growth, input.asOf, Math.max(horizonDays, 30), factors) / (Math.max(horizonDays, 30) / 30);

  // Deviation on the series without outlier documents: a single 104-unit boleta is not variability.
  const sigma = stdev(series.map((p) => p.qtyNoOutlier));

  const ssMonths = input.origin === 'imported' ? params.ssMonthsImported : params.ssMonthsNational;
  const ssRule = base === null ? 0 : base * (1 + growth) * ssMonths;
  const z = params.zByClass[input.abc] ?? 1.65;
  const ssStat = base === null ? null : z * sigma * Math.sqrt(horizonDays / 30);

  let ss = ssRule;
  let rop: number;
  let target: number;
  const intermittent = pattern === 'intermittent' || pattern === 'lumpy' || (base !== null && monthsWithSales < 6);
  if (base === null) {
    rop = 0; target = 0;
  } else if (intermittent) {
    // No normal formula fits 0-0-3-0-1: min is the typical non-zero month, max adds the horizon's demand.
    const nonZero = series.filter((p) => p.qty > 0).map((p) => p.qty);
    const min = Math.ceil(mean(nonZero));
    ss = min;
    rop = min;
    target = min + demandOverDays(base, growth, input.asOf, horizonDays, factors);
    reasons.push('Demanda intermitente: mín/máx en unidades en vez de fórmula');
  } else {
    rop = ss + demandOverDays(base, growth, input.asOf, leadTimeDays, factors);
    const cycleDays = input.cadenceDays ?? params.reviewDays;
    target = ss + demandOverDays(base, growth, input.asOf, leadTimeDays + cycleDays, factors);
  }

  const horizonEnd = new Date(input.asOf.getTime() + horizonDays * 86400000);
  const inTransit = input.inTransit.filter((t) => !t.eta || t.eta <= horizonEnd).reduce((s, t) => s + t.qty, 0);
  const inTransitLate = input.inTransit.filter((t) => t.eta && t.eta > horizonEnd).reduce((s, t) => s + t.qty, 0);
  if (input.inTransit.some((t) => !t.eta)) reasons.push('Tránsito sin ETA: se cuenta como si llegara dentro del horizonte');
  const position = input.available + inTransit;

  const suggested = Math.max(0, target - position);
  let rounded = roundToMoq(suggested, input.moq, input.orderMultiple);
  let moqExceedsHorizon = false;
  if (rounded > 0 && demandMonthly > 0 && rounded / demandMonthly > params.moqMaxCoverageMonths) {
    moqExceedsHorizon = true;
    reasons.push(`El MOQ cubre ${Math.round(rounded / demandMonthly)} meses de demanda`);
  }

  const cov = base === null ? null : coverageDays(input.available, input.inTransit, ss, base, growth, input.asOf, factors);
  const coverageMonths = cov === null ? null : Math.round((cov / 30) * 10) / 10;

  // Year-over-year for the coming month: shown, alerted, never multiplied (D2).
  const lastYearKey = addMonths(nextMonth, -12);
  const ly = input.history.find((h) => h.month === lastYearKey);
  const lastYear = params.monthKeys.includes(lastYearKey) ? (ly?.qty ?? 0) : null;
  const deltaPct = lastYear !== null && lastYear > 0 ? (demandNext - lastYear) / lastYear : null;
  const yoy = { month: nextMonth, lastYear, forecast: demandNext, deltaPct, alert: deltaPct !== null && Math.abs(deltaPct) > params.yoyAlertPct };
  if (yoy.alert) reasons.push(`Pronóstico ${deltaPct! > 0 ? '+' : ''}${Math.round(deltaPct! * 100)} % contra el mismo mes del año anterior`);

  let state: SkuState;
  if (input.lifecycle === 'discontinued') { state = 'DESCONTINUADO'; rounded = 0; }
  else if (input.lifecycle === 'phase_out') { state = 'PHASE_OUT'; rounded = 0; reasons.push('En descontinuación: no se compra'); }
  else if (base === null && monthsWithSales === 0) state = 'SIN_VENTA';
  else if (base === null) { state = 'NUEVO'; rounded = 0; reasons.push(`${monthsWithSales} meses con venta: sin pronóstico propio todavía`); }
  else if (position <= ss) state = 'QUIEBRE';
  else if (position <= rop) state = 'REPONER';
  else if (position > target + params.overstockExtraMonths * demandMonthly) state = 'SOBRE_STOCK';
  else state = 'OK';
  if (state === 'SIN_VENTA' && input.available > 0) reasons.push(`${input.available} u. en stock sin venta en la ventana: candidato a liquidar`);

  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    sku: input.sku, abc: input.abc, pattern, lifecycle: input.lifecycle,
    monthsOfData: series.length, monthsWithSales, firstSaleMonth,
    base: base === null ? null : r(base), seasonalNext, growth,
    demandNext: r(demandNext), demandMonthly: r(demandMonthly), sigma: r(sigma), leadTimeDays,
    ssRule: r(ssRule), ssStat: ssStat === null ? null : r(ssStat), ss: r(ss), rop: r(rop), target: r(target),
    available: input.available, inTransit, inTransitLate, position: r(position),
    suggested: r(suggested), rounded, moqExceedsHorizon, coverageDays: cov, coverageMonths,
    yoy: { ...yoy, forecast: r(demandNext) }, state, reasons,
  };
}
