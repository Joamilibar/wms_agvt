import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { usePlanningKpis, useOperationalAlerts, useForecastAccuracy, useCloseMonths, type PlanningAlert } from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import KpiCard from '../ui/KpiCard';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { btnGhost, fmtInt, fmtClp, monthLabel } from './ui-helpers';
import type { BadgeVariant } from '../../lib/status';

const SEVERITY: Record<PlanningAlert['severity'], [string, BadgeVariant]> = {
  critical: ['Crítica', 'red'], high: ['Alta', 'amber'], medium: ['Media', 'blue'], low: ['Baja', 'gray'],
};
const ALERT_TYPES: Record<string, string> = {
  quiebre_A: 'Quiebre clase A', nuevo_activo: 'Nuevo → activo', interanual: 'Desvío interanual', eta_vencida: 'ETA vencida', sin_eta: 'Sin ETA',
  sin_proveedor: 'Sin proveedor', materia_prima: 'Materia prima', sin_receta: 'Sin receta', proyecto_sin_cobertura: 'Proyecto sin cobertura',
};
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`);

/**
 * How the module is doing (phase 4): the KPIs that say whether the engine
 * beats the spreadsheet (WAPE 58 %, bias +17 %), the alerts that need a
 * person today, and the backtest per month and group.
 */
export default function TrackingTab() {
  const can = useAuthStore((s) => s.can);
  const { data: kpis, isLoading } = usePlanningKpis();
  const { data: alerts } = useOperationalAlerts();
  const [groupBy, setGroupBy] = useState<'abc' | 'origin' | 'category'>('abc');
  const { data: accuracy } = useForecastAccuracy(groupBy);
  const closeMonths = useCloseMonths();
  const [typeFilter, setTypeFilter] = useState<string>('');

  const alertTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alerts ?? []) m.set(a.type, (m.get(a.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alerts]);
  const shown = (alerts ?? []).filter((a) => !typeFilter || a.type === typeFilter);
  const totals = (accuracy ?? []).filter((m) => m.group === 'TOTAL');
  const chart = totals.map((m) => ({ month: monthLabel(m.month), wape: m.wape ?? 0, bias: m.bias ?? 0 }));

  const close = async () => {
    try {
      const r = await closeMonths.mutateAsync();
      toast.success(r.rows ? `${r.rows} pronósticos cerrados (${r.months.join(', ')})` : 'No hay meses pendientes de cerrar');
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading || !kpis) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted">Corrida de referencia <span className="font-mono text-brand-blue">{kpis.run?.number ?? '—'}</span>{kpis.run ? ` (${kpis.run.status === 'approved' ? 'aprobada' : kpis.run.status})` : ''}</span>
        <span className="flex-1" />
        {can('admin') && <button onClick={close} disabled={closeMonths.isPending} className={btnGhost}>Cerrar meses vencidos</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard title="WAPE" value={kpis.forecast ? pct(kpis.forecast.wape) : '—'} subtitle={kpis.forecast ? `${monthLabel(kpis.forecast.month)} · meta < 58 %` : 'Sin mes cerrado aún'} color={kpis.forecast?.wape !== null && kpis.forecast?.wape !== undefined ? (kpis.forecast.wape < 58 ? 'green' : 'amber') : 'gray'} />
        <KpiCard title="Sesgo" value={kpis.forecast ? pct(kpis.forecast.bias) : '—'} subtitle="+ = pronóstico alto · meta ±10 %" color={kpis.forecast?.bias !== null && kpis.forecast?.bias !== undefined ? (Math.abs(kpis.forecast.bias) <= 10 ? 'green' : 'amber') : 'gray'} />
        <KpiCard title="Quiebres A/B" value={kpis.breaches.ab} subtitle={`${kpis.breaches.all} en total`} color={kpis.breaches.ab ? 'red' : 'green'} />
        <KpiCard title="Sobre stock" value={`${kpis.overstock.skus} SKU`} subtitle={`${fmtInt(kpis.overstock.units)} u.${kpis.overstock.value !== null ? ` · ${fmtClp(kpis.overstock.value)}` : ''}`} color="amber" />
        <KpiCard title="Sin venta con stock" value={`${kpis.deadStock.skus} SKU`} subtitle={`${fmtInt(kpis.deadStock.units)} u.${kpis.deadStock.value !== null ? ` · ${fmtClp(kpis.deadStock.value)}` : ''}`} color="gray" />
        <KpiCard title="Fill rate 30 d" value={pct(kpis.fillRate.pct)} subtitle={`${fmtInt(kpis.fillRate.picked)} / ${fmtInt(kpis.fillRate.requested)} u. en ${kpis.fillRate.orders} pedidos`} color={kpis.fillRate.pct !== null && kpis.fillRate.pct >= 95 ? 'green' : 'blue'} />
        <KpiCard title="Proveedor a tiempo" value={pct(kpis.supplier.onTimePct)} subtitle={kpis.supplier.linesWithEta ? `${kpis.supplier.linesWithEta} líneas con ETA` : 'Sin recepciones con ETA'} color="purple" />
        <KpiCard title="Sugerido aceptado" value={pct(kpis.adoption.acceptedPct)} subtitle={`${kpis.adoption.lines} líneas en ${kpis.adoption.orders} OC · ${kpis.adoption.changed} ajustadas`} color="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Alertas ({alerts?.length ?? 0})</h3>
            <span className="flex-1" />
            <button onClick={() => setTypeFilter('')} className={`px-2 py-1 text-[11px] rounded-md border ${!typeFilter ? 'border-brand-blue text-text-primary' : 'border-border-primary text-text-muted'}`}>Todas</button>
            {alertTypes.map(([t, n]) => (
              <button key={t} onClick={() => setTypeFilter(t === typeFilter ? '' : t)} className={`px-2 py-1 text-[11px] rounded-md border ${typeFilter === t ? 'border-brand-blue text-text-primary' : 'border-border-primary text-text-muted'}`}>{ALERT_TYPES[t] ?? t} · {n}</button>
            ))}
          </div>
          <TableShell headers={['Severidad', 'Tipo', 'Detalle', 'Ref.']}>
            {shown.length === 0 && <Empty colSpan={4} text="Nada que atender" />}
            {shown.map((a, i) => (
              <tr key={i} className="border-b border-border-secondary">
                <td className="px-3 py-2"><Badge label={SEVERITY[a.severity][0]} variant={SEVERITY[a.severity][1]} /></td>
                <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{ALERT_TYPES[a.type] ?? a.type}</td>
                <td className="px-3 py-2 text-xs text-text-primary">{a.message}{a.sku && <span className="ml-2 font-mono text-[11px] text-text-muted">{a.sku}</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-muted">{a.ref ?? ''}</td>
              </tr>
            ))}
          </TableShell>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Producción</h3>
          <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-xs text-text-secondary space-y-1">
            <div className="flex justify-between"><span>Órdenes completadas</span><span className="text-text-primary">{kpis.production.orders}</span></div>
            <div className="flex justify-between"><span>Kg planificados</span><span className="text-text-primary">{kpis.production.kgPlanned.toLocaleString('es-CL')} kg</span></div>
            <div className="flex justify-between"><span>Kg consumidos</span><span className="text-text-primary">{kpis.production.kgConsumed.toLocaleString('es-CL')} kg</span></div>
            <div className="flex justify-between"><span>Merma real</span><span className="text-text-primary">{kpis.production.kgPlanned > 0 ? pct(Math.round(((kpis.production.kgConsumed - kpis.production.kgPlanned) / kpis.production.kgPlanned) * 1000) / 10) : '—'}</span></div>
          </div>
          {kpis.breaches.abSkus.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-text-primary">Quiebres A/B</h3>
              <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-xs space-y-1">
                {kpis.breaches.abSkus.map((s) => (
                  <div key={s.sku} className="flex items-center gap-2"><Badge label={s.abc} variant={s.abc === 'A' ? 'red' : 'amber'} /><span className="text-text-primary truncate" title={s.name}>{s.name || s.sku}</span></div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Exactitud del pronóstico por mes</h3>
          <span className="flex-1" />
          <div className="flex gap-1 border border-border-primary rounded-lg p-0.5">
            {(['abc', 'origin', 'category'] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className={`px-3 py-1 text-xs rounded-md ${groupBy === g ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-primary'}`}>{g === 'abc' ? 'Clase ABC' : g === 'origin' ? 'Origen' : 'Categoría'}</button>
            ))}
          </div>
        </div>
        {chart.length > 0 && (
          <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <Tooltip formatter={(v) => `${String(v ?? '')} %`} contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }} />
                <ReferenceLine y={58} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'planilla 58 %', fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }} />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar dataKey="wape" name="WAPE" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="bias" name="Sesgo" fill="#a855f7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <TableShell headers={['Mes', 'Corrida', 'Grupo', 'SKU', 'Pronóstico', 'Real', 'WAPE', 'Sesgo']}>
          {(accuracy ?? []).length === 0 && <Empty colSpan={8} text="Se llena solo: cada corrida registra su pronóstico y el día 1 de cada mes se compara con la venta real" />}
          {(accuracy ?? []).map((m) => (
            <tr key={`${m.month}|${m.group}`} className={`border-b border-border-secondary ${m.group === 'TOTAL' ? 'bg-bg-tertiary/40 font-medium' : ''}`}>
              <td className="px-3 py-2 text-xs text-text-primary">{monthLabel(m.month)}</td>
              <td className="px-3 py-2 font-mono text-xs text-text-muted">{m.runNumber}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{m.group}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{m.skus}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{fmtInt(m.forecast)}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{fmtInt(m.actual)}</td>
              <td className={`px-3 py-2 text-xs ${m.wape !== null && m.wape < 58 ? 'text-brand-green' : 'text-brand-amber'}`}>{pct(m.wape)}</td>
              <td className={`px-3 py-2 text-xs ${m.bias !== null && Math.abs(m.bias) <= 10 ? 'text-brand-green' : 'text-brand-amber'}`}>{m.bias !== null && m.bias > 0 ? '+' : ''}{pct(m.bias)}</td>
            </tr>
          ))}
        </TableShell>
      </div>
    </div>
  );
}
