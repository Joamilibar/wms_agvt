import { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import api from '../../lib/api';
import {
  useLatestRun, usePlanningRuns, useRunResults, useCreateRun, useApproveRun, useSuppliers,
  type RunResult, type SkuState, type PlanningRunHeader,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import { confirmDialog } from '../../lib/confirm';
import KpiCard from '../ui/KpiCard';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary, fmtInt, monthLabel } from './ui-helpers';
import type { BadgeVariant } from '../../lib/status';

const STATE_LABEL: Record<SkuState, string> = {
  QUIEBRE: 'Quiebre', REPONER: 'Reponer', NUEVO: 'Nuevo', OK: 'OK', SOBRE_STOCK: 'Sobre stock', SIN_VENTA: 'Sin venta', PHASE_OUT: 'Descontinuando', DESCONTINUADO: 'Descontinuado',
};
const STATE_VARIANT: Record<SkuState, BadgeVariant> = {
  QUIEBRE: 'red', REPONER: 'amber', NUEVO: 'purple', OK: 'green', SOBRE_STOCK: 'blue', SIN_VENTA: 'gray', PHASE_OUT: 'gray', DESCONTINUADO: 'gray',
};
const PATTERN_LABEL = { smooth: 'suave', erratic: 'errática', intermittent: 'intermitente', lumpy: 'irregular' } as const;

/**
 * The planning board: the latest run's semaphore per SKU with everything
 * behind each number — base, safety, reorder point, position, coverage,
 * and the year-over-year figure that alerts but never multiplies (D2).
 */
export default function BoardTab() {
  const can = useAuthStore((s) => s.can);
  const { data: latest, isLoading: loadingLatest } = useLatestRun();
  const { data: runs } = usePlanningRuns();
  const { data: suppliers } = useSuppliers();
  const [runId, setRunId] = useState<string | null>(null);
  const activeId = runId ?? latest?._id ?? null;
  const [filters, setFilters] = useState({ state: '', origin: '', supplierId: '', abc: '', search: '', onlySuggested: false });
  const { data, isFetching } = useRunResults(activeId, {
    state: filters.state || undefined, origin: filters.origin || undefined, supplierId: filters.supplierId || undefined,
    abc: filters.abc || undefined, search: filters.search || undefined, onlySuggested: filters.onlySuggested || undefined,
  });
  const createRun = useCreateRun();
  const approveRun = useApproveRun();
  const [open, setOpen] = useState<string | null>(null);
  const run: PlanningRunHeader | undefined = data?.run ?? latest ?? undefined;

  const handleRun = async () => {
    try {
      const r = await createRun.mutateAsync('');
      setRunId(r._id);
      toast.success(`Corrida ${r.number}: ${r.summary.QUIEBRE ?? 0} en quiebre, ${r.summary.REPONER ?? 0} por reponer`);
    } catch (e) {
      toast.error('No se pudo correr: ' + getErrorMessage(e));
    }
  };
  const handleApprove = async () => {
    if (!run) return;
    if (!(await confirmDialog({ title: `Aprobar ${run.number}`, detail: 'La corrida aprobada anterior pasa a "superada".', confirmLabel: 'Aprobar' }))) return;
    try {
      await approveRun.mutateAsync(run._id);
      toast.success(`${run.number} aprobada`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };
  const handleExport = async () => {
    if (!run) return;
    try {
      const res = await api.get(`/planning/runs/${run._id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${run.number}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('No se pudo exportar: ' + getErrorMessage(e));
    }
  };

  if (loadingLatest) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={activeId ?? ''} onChange={(e) => setRunId(e.target.value || null)} className={selectCls}>
          {(runs ?? []).map((r) => <option key={r._id} value={r._id}>{r.number} · {format(new Date(r.asOf), 'dd-MM-yyyy')} · {r.status === 'approved' ? 'aprobada' : r.status === 'superseded' ? 'superada' : 'borrador'}</option>)}
          {!runs?.length && <option value="">Sin corridas</option>}
        </select>
        {run && <span className="text-xs text-text-muted">ventana {monthLabel(run.fromMonth)} → {monthLabel(run.toMonth)} · parámetros v{run.paramsVersion} · bodegas: {run.purchaseWarehouses.join(', ')}</span>}
        <span className="flex-1" />
        {run && <button onClick={handleExport} className={btnGhost}>Exportar CSV (Power BI)</button>}
        {can('admin') && run?.status === 'draft' && <button onClick={handleApprove} disabled={approveRun.isPending} className={btnGhost}>Aprobar corrida</button>}
        {can('admin', 'supervisor') && <button onClick={handleRun} disabled={createRun.isPending} className={btnPrimary}>{createRun.isPending ? 'Calculando…' : 'Correr motor'}</button>}
      </div>

      {run && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard title="Quiebre" value={run.summary.QUIEBRE ?? 0} subtitle="Posición bajo la seguridad" color="red" />
          <KpiCard title="Reponer" value={run.summary.REPONER ?? 0} subtitle="Bajo el punto de reorden" color="amber" />
          <KpiCard title="Sobre stock" value={run.summary.SOBRE_STOCK ?? 0} subtitle="Más de objetivo + 2 meses" color="blue" />
          <KpiCard title="Nuevos" value={run.summary.NUEVO ?? 0} subtitle="Menos de 3 meses con venta" color="purple" />
          <KpiCard title="Unidades sugeridas" value={fmtInt(run.summary.suggestedUnits ?? 0)} subtitle={`${run.summary.moqFlags ?? 0} con MOQ sobre el horizonte`} color="green" />
          <KpiCard title="Sin lead time" value={run.summary.missingLeadTime ?? 0} subtitle="Importados sin proveedor" color={run.summary.missingLeadTime ? 'red' : 'gray'} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="SKU, nombre o categoría" className={`${inputCls} w-56`} />
        <select value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} className={selectCls}>
          <option value="">Todos los estados</option>
          {(Object.keys(STATE_LABEL) as SkuState[]).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
        </select>
        <select value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })} className={selectCls}>
          <option value="">Todo origen</option><option value="imported">Importado</option><option value="national">Nacional</option><option value="raw_material">Materia prima</option><option value="supply">Insumo</option><option value="unknown">Sin definir</option>
        </select>
        <select value={filters.supplierId} onChange={(e) => setFilters({ ...filters, supplierId: e.target.value })} className={selectCls}>
          <option value="">Todo proveedor</option>
          {(suppliers ?? []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select value={filters.abc} onChange={(e) => setFilters({ ...filters, abc: e.target.value })} className={selectCls}>
          <option value="">ABC</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={filters.onlySuggested} onChange={(e) => setFilters({ ...filters, onlySuggested: e.target.checked })} className="accent-brand-blue" />
          Solo con pedido
        </label>
        <span className="text-xs text-text-muted ml-auto">{data ? `${data.rows.length} SKU` : ''}{isFetching ? ' …' : ''}</span>
      </div>

      <TableShell headers={['', 'Estado', 'ABC', 'SKU', 'Producto', 'Dem./mes horizonte', 'Seguridad', 'ROP', 'Objetivo', 'Disp.', 'Tránsito', 'Cobertura', 'Sugerido', 'Pedido', 'Proveedor']}>
        {data?.rows.length === 0 && <Empty colSpan={15} text={run ? 'Ningún SKU coincide' : 'Corre el motor para ver el tablero'} />}
        {data?.rows.map((r) => {
          const isOpen = open === r.sku;
          return [
            <tr key={r.sku} onClick={() => setOpen(isOpen ? null : r.sku)} className="border-b border-border-secondary hover:bg-bg-tertiary/50 cursor-pointer">
              <td className="pl-3 text-text-muted text-xs">{isOpen ? '▾' : '▸'}</td>
              <td className="px-2 py-2"><Badge label={STATE_LABEL[r.state]} variant={STATE_VARIANT[r.state]} /></td>
              <td className="px-2 py-2 font-semibold text-text-primary">{r.abc}</td>
              <td className="px-2 py-2 font-mono text-xs text-brand-blue">{r.sku}</td>
              <td className="px-2 py-2 text-text-primary text-xs max-w-[260px] truncate" title={r.name}>{r.name}<div className="text-[11px] text-text-muted">{r.category}{r.pattern ? ` · ${PATTERN_LABEL[r.pattern]}` : ''}</div></td>
              <td className="px-2 py-2 text-xs text-text-secondary">{r.base === null ? '—' : fmt1(r.demandMonthly)}{r.yoy.alert && <span className="ml-1 text-brand-amber" title={`Mismo mes año anterior: ${r.yoy.lastYear ?? '—'}`}>⚠</span>}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{fmt1(r.ss)}{r.ssStat !== null && <span className="text-text-muted" title="Referencia estadística"> ({fmt1(r.ssStat)})</span>}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{fmt1(r.rop)}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{fmt1(r.target)}</td>
              <td className="px-2 py-2 text-xs text-text-primary font-semibold">{fmtInt(r.available)}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{fmtInt(r.inTransit)}{r.inTransitLate > 0 && <span className="text-text-muted" title="Llega después del horizonte"> +{fmtInt(r.inTransitLate)}</span>}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{r.coverageMonths === null ? '—' : `${r.coverageMonths} m`}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{fmt1(r.suggested)}</td>
              <td className={`px-2 py-2 font-semibold ${r.moqExceedsHorizon ? 'text-brand-amber' : 'text-text-primary'}`}>{fmtInt(r.rounded)}{r.moqExceedsHorizon && ' !'}</td>
              <td className="px-2 py-2 text-xs text-text-secondary">{r.supplierName ?? (r.origin === 'imported' ? <span className="text-brand-red">falta</span> : '—')}</td>
            </tr>,
            isOpen && <tr key={`${r.sku}-d`} className="border-b border-border-secondary bg-bg-tertiary/30"><td colSpan={15} className="px-6 py-3"><Detail r={r} /></td></tr>,
          ];
        })}
      </TableShell>
    </div>
  );
}

const fmt1 = (n: number) => (Math.abs(n) >= 100 ? fmtInt(n) : (Math.round(n * 10) / 10).toString());

function Detail({ r }: { r: RunResult }) {
  const items: [string, string][] = [
    ['Meses de dato / con venta', `${r.monthsOfData} / ${r.monthsWithSales}${r.firstSaleMonth ? ` (desde ${monthLabel(r.firstSaleMonth)})` : ''}`],
    ['Base (mezcla 12 m / 6 m)', r.base === null ? '— (nuevo)' : fmt1(r.base)],
    ['Factor estacional próximo mes · crecimiento', `×${r.seasonalNext} · +${Math.round(r.growth * 100)} %`],
    ['Pronóstico próximo mes', `${fmt1(r.demandNext)} (${monthLabel(r.yoy.month)})`],
    ['Mismo mes año anterior', r.yoy.lastYear === null ? 'sin dato' : `${fmtInt(r.yoy.lastYear)}${r.yoy.deltaPct !== null ? ` → ${r.yoy.deltaPct > 0 ? '+' : ''}${Math.round(r.yoy.deltaPct * 100)} %` : ''}`],
    ['Desviación mensual (sin outliers)', fmt1(r.sigma)],
    ['Lead time total', `${r.leadTimeDays} d`],
    ['Seguridad: regla · estadística', `${fmt1(r.ssRule)} · ${r.ssStat === null ? '—' : fmt1(r.ssStat)}`],
    ['Posición (disponible + tránsito)', `${fmtInt(r.position)}`],
    ['Cobertura proyectada', r.coverageDays === null ? '—' : `${r.coverageDays} días`],
    ['MOQ', r.moq === null ? '—' : fmtInt(r.moq)],
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs">
      {items.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-border-secondary/60 py-1"><span className="text-text-muted">{k}</span><span className="text-text-primary font-medium text-right">{v}</span></div>)}
      {r.reasons.length > 0 && (
        <ul className="md:col-span-2 mt-2 list-disc pl-4 text-brand-amber space-y-0.5">
          {r.reasons.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
    </div>
  );
}
