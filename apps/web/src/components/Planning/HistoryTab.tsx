import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  useHistoryCoverage, useHistoryMonthly, usePlanningWindow, useSkuSeries, useLoadHistory, useHistoryJob,
  type MonthlyTotal, type SkuSeriesRow,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import KpiCard from '../ui/KpiCard';
import Badge from '../ui/Badge';
import { TableShell, Empty } from './ui';
import { inputCls, btnPrimary, fmtInt, fmtClp, monthLabel } from './ui-helpers';

const tooltipStyle = { backgroundColor: '#161b27', border: '1px solid #2a3142', borderRadius: 8, color: '#f1f5f9', fontSize: 12 };
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * The history as the engine will read it: retail and projects side by side,
 * one SKU at a time with its year-over-year panel. The panel is mandatory
 * (D2) — it shows and alerts, it never multiplies the forecast.
 */
export default function HistoryTab() {
  const can = useAuthStore((s) => s.can);
  const { data: window } = usePlanningWindow();
  const { data: coverage } = useHistoryCoverage();
  const { data: monthly } = useHistoryMonthly();
  const [sku, setSku] = useState('');
  const [query, setQuery] = useState('');
  const { data: series, isFetching } = useSkuSeries(query);
  const loadMutation = useLoadHistory();
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useHistoryJob(jobId);
  // One project invoice (sep-2025, 21.110 u.) flattens the retail bars; let the reader drop it.
  const [hideProjects, setHideProjects] = useState(false);

  const chart = useMemo(() => pivotMonthly(monthly ?? [], window?.monthKeys ?? []), [monthly, window]);
  const totals = useMemo(() => {
    const t = { retail: 0, project: 0, net: 0 };
    for (const r of monthly ?? []) { t[r._id.channel] += r.units; t.net += r.net; }
    return t;
  }, [monthly]);

  const handleLoad = async () => {
    try {
      const { jobId: id } = await loadMutation.mutateAsync({});
      setJobId(id);
      toast.success('Carga encolada; puede tardar unos minutos');
    } catch (e) {
      toast.error('No se pudo encolar la carga: ' + getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm text-text-muted">
          Ventana: <span className="text-text-primary font-medium">{window ? `${monthLabel(window.fromMonth)} → ${monthLabel(window.toMonth)}` : '…'}</span>
          {window && <span> · {window.months} de 24 meses</span>}
          {coverage?.lastMonth && <span> · cargado hasta <span className="text-text-primary">{monthLabel(coverage.lastMonth)}</span> ({fmtInt(coverage.documents)} documentos)</span>}
        </div>
        {can('admin') && (
          <button onClick={handleLoad} disabled={loadMutation.isPending || job?.state === 'active' || job?.state === 'waiting'} className={btnPrimary}>
            {job && (job.state === 'active' || job.state === 'waiting') ? 'Cargando desde BSale…' : 'Actualizar desde BSale'}
          </button>
        )}
      </div>

      {job?.state === 'completed' && job.result && (
        <div className="bg-brand-green/10 border border-brand-green/30 rounded-xl p-3 text-xs text-text-secondary">
          Carga {job.result.from} → {job.result.to}: {fmtInt(job.result.documents)} documentos, {fmtInt(job.result.lines)} líneas,
          {' '}{fmtInt(job.result.packLinesExploded)} de componentes de pack, {job.result.creditNotesLinked} notas de crédito vinculadas
          {job.result.creditNotesUnlinked > 0 && <span className="text-brand-amber"> ({job.result.creditNotesUnlinked} sin factura)</span>},
          {' '}{job.result.outlierDocs} documentos outlier (≥ {job.result.outlierThreshold} u.).
        </div>
      )}
      {job?.state === 'failed' && <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-3 text-xs text-brand-red">La carga falló: {job.failedReason}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Unidades retail" value={fmtInt(totals.retail)} subtitle="Lo que alimenta el pronóstico" color="blue" />
        <KpiCard title="Unidades proyectos" value={fmtInt(totals.project)} subtitle="B2B: pipeline, no serie" color="purple" />
        <KpiCard title="Venta neta ventana" value={fmtClp(totals.net)} subtitle="Ambos canales" color="green" />
      </div>

      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Unidades por mes y canal</h3>
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={hideProjects} onChange={(e) => setHideProjects(e.target.checked)} className="accent-brand-blue" />
            Solo retail
          </label>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart}>
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtInt(Number(v)), n === 'retail' ? 'Retail' : 'Proyectos']} />
            <Legend formatter={(v) => (v === 'retail' ? 'Retail' : 'Proyectos')} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="retail" stackId="a" fill="#1a7fe8" radius={hideProjects ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            {!hideProjects && <Bar dataKey="project" stackId="a" fill="#7c5abf" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 space-y-4">
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(sku.trim()); }}
          className="flex flex-wrap items-center gap-3"
        >
          <h3 className="text-sm font-semibold text-text-primary">Serie de un SKU</h3>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (código de BSale)" className={`${inputCls} w-64`} />
          <button type="submit" className={btnPrimary} disabled={!sku.trim() || isFetching}>Ver</button>
          <span className="text-xs text-text-muted">Incluye lo vendido como componente de pack.</span>
        </form>
        {query && <SkuPanel sku={query} rows={series ?? []} monthKeys={window?.monthKeys ?? []} />}
      </div>
    </div>
  );
}

function pivotMonthly(rows: MonthlyTotal[], monthKeys: string[]) {
  const map = new Map(monthKeys.map((m) => [m, { month: m, label: monthLabel(m), retail: 0, project: 0 }]));
  for (const r of rows) {
    const row = map.get(r._id.month);
    if (row) row[r._id.channel] += r.units;
  }
  return [...map.values()];
}

function SkuPanel({ sku, rows, monthKeys }: { sku: string; rows: SkuSeriesRow[]; monthKeys: string[] }) {
  const byMonth = useMemo(() => {
    const map = new Map(monthKeys.map((m) => [m, { month: m, label: monthLabel(m), retail: 0, project: 0, viaPack: 0 }]));
    for (const r of rows) {
      const row = map.get(r._id.month);
      if (!row) continue;
      row[r._id.channel] += r.units;
      if (r._id.channel === 'retail') row.viaPack += r.viaPack;
    }
    return [...map.values()];
  }, [rows, monthKeys]);

  // Year-over-year: retail units of the same calendar month in each year of the window.
  const years = useMemo(() => [...new Set(monthKeys.map((m) => m.slice(0, 4)))], [monthKeys]);
  const yoy = useMemo(() => MONTHS.map((name, i) => {
    const key = String(i + 1).padStart(2, '0');
    const perYear = years.map((y) => {
      const row = byMonth.find((r) => r.month === `${y}-${key}`);
      return row ? row.retail : null;
    });
    return { name, perYear };
  }), [byMonth, years]);

  const retailTotal = byMonth.reduce((s, r) => s + r.retail, 0);
  const monthsWithSales = byMonth.filter((r) => r.retail > 0).length;
  const firstSale = byMonth.find((r) => r.retail > 0 || r.project > 0)?.month;
  const viaPack = byMonth.reduce((s, r) => s + r.viaPack, 0);

  if (rows.length === 0) return <p className="text-sm text-text-muted">Sin ventas de {sku} en la ventana.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
        <Badge label={`${fmtInt(retailTotal)} u. retail`} variant="blue" />
        <Badge label={`${monthsWithSales} meses con venta`} variant={monthsWithSales < 3 ? 'amber' : 'gray'} />
        {firstSale && <Badge label={`primera venta ${monthLabel(firstSale)}`} variant="gray" />}
        {viaPack > 0 && <Badge label={`${fmtInt(viaPack)} u. vía pack`} variant="purple" />}
        {monthsWithSales < 3 && <span className="text-brand-amber self-center">Menos de 3 meses de dato: el motor lo tratará como nuevo.</span>}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={byMonth}>
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtInt(Number(v)), n === 'retail' ? 'Retail' : 'Proyectos']} />
          <Bar dataKey="retail" stackId="a" fill="#1a7fe8" />
          <Bar dataKey="project" stackId="a" fill="#7c5abf" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Comparación interanual · retail</h4>
        <TableShell headers={['Mes', ...years, 'Variación']}>
          {yoy.map((r) => {
            const last = r.perYear[r.perYear.length - 1];
            const prev = r.perYear.length > 1 ? r.perYear[r.perYear.length - 2] : null;
            const delta = last !== null && prev !== null && prev > 0 ? (last - prev) / prev : null;
            const alert = delta !== null && Math.abs(delta) > 0.5;
            return (
              <tr key={r.name} className="border-b border-border-secondary">
                <td className="px-3 py-1.5 text-text-secondary">{r.name}</td>
                {r.perYear.map((v, i) => <td key={i} className="px-3 py-1.5 font-semibold text-text-primary">{v === null ? <span className="text-text-muted font-normal">—</span> : fmtInt(v)}</td>)}
                <td className={`px-3 py-1.5 text-xs ${alert ? 'text-brand-amber font-semibold' : 'text-text-muted'}`}>
                  {delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)} %`}{alert ? ' ⚠' : ''}
                </td>
              </tr>
            );
          })}
          {years.length < 2 && <Empty colSpan={years.length + 2} text="Con un solo año en la ventana no hay comparación posible todavía." />}
        </TableShell>
      </div>
    </div>
  );
}
