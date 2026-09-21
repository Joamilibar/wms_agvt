/** Shared classes and formatters for the planning screens (kept out of ui.tsx so fast refresh works). */
export const inputCls =
  'px-2 py-1.5 bg-bg-tertiary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue';
export const selectCls = inputCls;
export const btnPrimary =
  'px-3 py-1.5 bg-brand-blue text-white text-sm font-medium rounded-lg hover:bg-brand-blue/80 transition-colors disabled:opacity-50';
export const btnGhost =
  'px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-xs text-text-secondary hover:bg-bg-tertiary transition-colors disabled:opacity-40';


export const fmtInt = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);
export const fmtClp = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
export const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(mm) - 1]} ${y.slice(2)}`;
};
/** Day of an ISO date stored at UTC midnight, without the timezone shifting it a day back. */
export const fmtIsoDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
