/**
 * The history window is a rule of the system, not a parameter: sales are read
 * from 1 January 2025 up to the last day of the month before the run, and
 * never more than 24 months. The window fills up in January 2027; until then
 * it simply starts at the fixed date.
 */
export const HISTORY_FLOOR = new Date(Date.UTC(2025, 0, 1));
export const HISTORY_MAX_MONTHS = 24;

export interface HistoryWindow {
  /** First day included (UTC midnight). */
  from: Date;
  /** Last day included (UTC midnight). */
  to: Date;
  /** `YYYY-MM` of the first and last month. */
  fromMonth: string;
  toMonth: string;
  /** Number of months in the window. */
  months: number;
  /** Every month in the window, oldest first. */
  monthKeys: string[];
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function historyWindow(asOf: Date = new Date()): HistoryWindow {
  const firstOfThisMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const to = new Date(firstOfThisMonth.getTime() - 24 * 3600 * 1000);
  const cap = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - HISTORY_MAX_MONTHS, 1));
  const from = cap > HISTORY_FLOOR ? cap : HISTORY_FLOOR;

  const monthKeys: string[] = [];
  for (let d = new Date(from); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    monthKeys.push(monthKey(d));
  }

  return { from, to, fromMonth: monthKeys[0], toMonth: monthKeys[monthKeys.length - 1], months: monthKeys.length, monthKeys };
}
