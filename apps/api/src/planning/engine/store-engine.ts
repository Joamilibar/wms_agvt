/**
 * Store replenishment as pure functions (D10): one store, its own sales,
 * an ideal per SKU — manual where the team set one, computed where not —
 * and a shipment that never exceeds what the warehouse can give.
 *
 * Fixed with the client: cycle of 7 days with one or two deliveries a week
 * depending on volume; the 470 manual ideals migrate as overrides.
 */

export type StoreState = 'ENVIAR' | 'FALTANTE_SIN_RESPALDO' | 'RETIRO' | 'SOBRE_STOCK' | 'OK' | 'SIN_IDEAL';

export interface StoreParams {
  cycleDays: number;
  deliveryDays: number;
  displayMin: Record<string, number>;
  demandWindowDays: number;
  splitDeliveryUnits: number;
  /** Months without a sale at the store before stock above the ideal is proposed for withdrawal. */
  withdrawAfterMonths: number;
  zByClass: Record<string, number>;
}

export interface StoreSkuInput {
  sku: string;
  abc: 'A' | 'B' | 'C';
  /** Daily sales at the store inside the demand window (days with no sale are absent). */
  dailySales: { date: string; qty: number }[];
  /** Units sold at the store in the last `withdrawAfterMonths` months. */
  soldRecently: number;
  manualIdeal: { ideal: number; displayMin: number } | null;
  stockStore: number;
  inTransitToStore: number;
  availableSource: number;
}

export interface StoreSkuResult {
  sku: string;
  abc: 'A' | 'B' | 'C';
  dailyDemand: number;
  sigmaDaily: number;
  ideal: number;
  idealSource: 'manual' | 'computed' | 'none';
  displayMin: number;
  stockStore: number;
  inTransit: number;
  availableSource: number;
  need: number;
  send: number;
  withdraw: number;
  coverageDays: number | null;
  state: StoreState;
  reasons: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

/** Daily series with zeros for the days without a sale, over the whole window. */
export function dailySeries(sales: { date: string; qty: number }[], windowDays: number): number[] {
  const byDay = new Map<string, number>();
  for (const s of sales) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.qty);
  // Position is relative: we only need the multiset of daily quantities, zeros included.
  const nonZero = [...byDay.values()];
  const zeros = Math.max(0, windowDays - nonZero.length);
  return [...nonZero, ...new Array<number>(zeros).fill(0)];
}

/**
 * The computed ideal: demand over cycle + delivery, plus safety on the
 * daily variability, plus the display minimum of the class. Rounded up
 * because a store holds whole units.
 */
export function computedIdeal(dailyDemand: number, sigmaDaily: number, abc: string, p: StoreParams): { ideal: number; displayMin: number } {
  const horizon = p.cycleDays + p.deliveryDays;
  const z = p.zByClass[abc] ?? 1.65;
  const displayMin = dailyDemand > 0 ? (p.displayMin[abc] ?? 0) : 0;
  const ideal = dailyDemand > 0 ? Math.ceil(dailyDemand * horizon + z * sigmaDaily * Math.sqrt(horizon)) + displayMin : 0;
  return { ideal, displayMin };
}

export function evaluateStoreSku(input: StoreSkuInput, p: StoreParams): StoreSkuResult {
  const reasons: string[] = [];
  const series = dailySeries(input.dailySales, p.demandWindowDays);
  const dailyDemand = mean(series);
  const sigmaDaily = stdev(series);

  let ideal: number;
  let displayMin: number;
  let idealSource: StoreSkuResult['idealSource'];
  if (input.manualIdeal) {
    ideal = input.manualIdeal.ideal;
    displayMin = input.manualIdeal.displayMin;
    idealSource = 'manual';
    const c = computedIdeal(dailyDemand, sigmaDaily, input.abc, p);
    if (dailyDemand > 0 && c.ideal > ideal * 2) reasons.push(`El ideal manual (${ideal}) cubre menos de la mitad de lo que la venta pide (${c.ideal})`);
    if (dailyDemand === 0 && input.soldRecently === 0 && ideal > 0) reasons.push('Ideal manual sin ventas en la tienda en la ventana');
  } else {
    const c = computedIdeal(dailyDemand, sigmaDaily, input.abc, p);
    ideal = c.ideal;
    displayMin = c.displayMin;
    idealSource = dailyDemand > 0 ? 'computed' : 'none';
  }

  const need = Math.max(0, ideal - input.stockStore - input.inTransitToStore);
  const send = Math.min(need, Math.max(0, input.availableSource));
  let withdraw = 0;
  if (input.stockStore > ideal && input.soldRecently === 0 && dailyDemand === 0) {
    withdraw = input.stockStore - ideal;
    reasons.push(`Sin ventas en ${p.withdrawAfterMonths} meses: ${withdraw} u. sobre el ideal para retirar`);
  }
  const coverageDays = dailyDemand > 0 ? Math.round((input.stockStore + input.inTransitToStore) / dailyDemand) : null;

  let state: StoreState;
  if (idealSource === 'none') state = input.stockStore > 0 && withdraw > 0 ? 'RETIRO' : 'SIN_IDEAL';
  else if (withdraw > 0) state = 'RETIRO';
  else if (need > 0 && input.availableSource <= 0) { state = 'FALTANTE_SIN_RESPALDO'; reasons.push('La bodega no tiene stock: pasa a compra o producción'); }
  else if (send > 0) { state = 'ENVIAR'; if (send < need) reasons.push(`La bodega solo cubre ${send} de ${need}`); }
  else if (input.stockStore > ideal * 2 && ideal > 0) state = 'SOBRE_STOCK';
  else state = 'OK';

  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    sku: input.sku, abc: input.abc, dailyDemand: r(dailyDemand), sigmaDaily: r(sigmaDaily), ideal, idealSource, displayMin,
    stockStore: input.stockStore, inTransit: input.inTransitToStore, availableSource: input.availableSource,
    need, send, withdraw, coverageDays, state, reasons,
  };
}

/** How many deliveries this week's plan needs (D10: one, or two when the volume is high). */
export function deliveriesFor(totalUnits: number, p: StoreParams): number {
  return totalUnits > p.splitDeliveryUnits ? 2 : 1;
}
