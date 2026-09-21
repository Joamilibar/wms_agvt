import { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  usePlanningParams, usePlanningParamsHistory, useUpdatePlanningParams, useDemandEvents, useSaveDemandEvent, useDeleteDemandEvent, usePlanningItems,
  type PlanningParams, type PlanningParamsPatch, type DemandEvent,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import { confirmDialog } from '../../lib/confirm';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, btnGhost, btnPrimary, fmtIsoDay } from './ui-helpers';

type NumKey = { [K in keyof PlanningParamsPatch]-?: PlanningParams[K] extends number ? K : never }[keyof PlanningParamsPatch];
interface Field { key: NumKey; label: string; hint: string; step?: number; pct?: boolean }
interface Group { title: string; decision: string; fields: Field[] }

const GROUPS: Group[] = [
  { title: 'Pronóstico', decision: 'D2 · D3', fields: [
    { key: 'baseWeight12m', label: 'Peso promedio 12 m', hint: 'El resto va al promedio de 6 m', step: 0.05 },
    { key: 'growthDefault', label: 'Crecimiento', hint: 'Sobre la base; editable por categoría abajo', step: 0.05, pct: true },
    { key: 'yoyAlertPct', label: 'Alerta interanual', hint: 'Desvío contra el mismo mes del año anterior', step: 0.05, pct: true },
    { key: 'newSkuMonths', label: 'Meses para dejar de ser nuevo', hint: 'Antes no hay pronóstico estadístico' },
  ] },
  { title: 'Seguridad y reorden', decision: 'D4 · D7', fields: [
    { key: 'ssMonthsImported', label: 'Seguridad importados (meses)', hint: 'Regla vigente; el estadístico se muestra al lado', step: 0.5 },
    { key: 'ssMonthsNational', label: 'Seguridad nacionales (meses)', hint: 'Producción propia', step: 0.5 },
    { key: 'reviewDays', label: 'Ciclo de revisión (días)', hint: 'Cada cuánto se corre el motor' },
    { key: 'nationalLeadTimeDays', label: 'Lead time nacional (días)', hint: 'Taller: de orden a lote terminado' },
    { key: 'moqMaxCoverageMonths', label: 'MOQ máximo (meses)', hint: 'Un MOQ que cubre más se marca, no se pide' },
    { key: 'overstockExtraMonths', label: 'Sobre stock (meses extra)', hint: 'Sobre el objetivo' },
    { key: 'phaseOutMonths', label: 'Phase-out (meses sin venta)', hint: 'Con stock en mano' },
  ] },
  { title: 'Canal proyectos', decision: 'D1', fields: [
    { key: 'projectMinUnits', label: 'Unidades mínimas por documento', hint: 'Empresa con esta cantidad = proyecto' },
    { key: 'companyRutMin', label: 'RUT empresa desde', hint: 'Sin puntos ni dígito verificador' },
    { key: 'companyRutMax', label: 'RUT empresa hasta', hint: '' },
    { key: 'outlierPercentile', label: 'Percentil de outlier', hint: 'Documentos retail por sobre este percentil no cuentan' },
  ] },
  { title: 'Tienda', decision: 'D10', fields: [
    { key: 'storeCycleDays', label: 'Ciclo (días)', hint: 'Semana de reposición' },
    { key: 'storeDeliveryDays', label: 'Entrega (días)', hint: 'De bodega a tienda' },
    { key: 'storeDemandWindowDays', label: 'Ventana de demanda (días)', hint: 'Para la demanda diaria de la tienda' },
    { key: 'storeSplitDeliveryUnits', label: 'Partir entrega sobre (u.)', hint: 'Dos entregas en la semana' },
  ] },
  { title: 'Producción', decision: 'D8', fields: [
    { key: 'scrapPct', label: 'Merma por defecto', hint: 'Solo sobre kg y metros', step: 0.01, pct: true },
  ] },
];
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Every number the engine reads, with the decision it comes from, plus the
 * demand events that multiply specific months. Saving creates a new version;
 * the next run says which version it used.
 */
export default function ParamsTab() {
  const can = useAuthStore((s) => s.can);
  const { data: params, isLoading } = usePlanningParams();
  const { data: history } = usePlanningParamsHistory();
  const update = useUpdatePlanningParams();
  const [patch, setPatch] = useState<PlanningParamsPatch>({});
  const [note, setNote] = useState('');
  const { data: catalog } = usePlanningItems({});
  const categories = [...new Set((catalog ?? []).map((i) => i.category).filter(Boolean))].sort();

  if (isLoading || !params) return <LoadingSpinner />;
  const cur = { ...params, ...patch };
  const dirty = Object.keys(patch).length > 0;
  const setNum = (key: NumKey, v: string) => setPatch((p) => ({ ...p, [key]: v === '' ? params[key] : Number(v) }));
  const setMap = (key: 'growthByCategory' | 'seasonalFactors' | 'zByClass' | 'storeDisplayMin', k: string, v: string) => {
    const base = { ...(cur[key] ?? {}) };
    if (v === '') delete base[k]; else base[k] = Number(v);
    setPatch((p) => ({ ...p, [key]: base }));
  };
  const save = async () => {
    if (!(await confirmDialog({ title: 'Guardar parámetros', detail: `Se crea la versión ${params.version + 1}. Las corridas anteriores conservan la suya.`, confirmLabel: 'Guardar' }))) return;
    try {
      await update.mutateAsync({ ...patch, changeNote: note });
      toast.success(`Parámetros v${params.version + 1} guardados`);
      setPatch({}); setNote('');
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted">Versión <span className="font-mono text-brand-blue">v{params.version}</span>{params.changedBy ? ` · ${params.changedBy}` : ''}{params.changeNote ? ` · ${params.changeNote}` : ''}</span>
        <span className="flex-1" />
        {can('admin') && (
          <>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-64`} placeholder="Motivo del cambio" />
            {dirty && <button onClick={() => setPatch({})} className={btnGhost}>Descartar</button>}
            <button onClick={save} disabled={!dirty || update.isPending} className={btnPrimary}>Guardar versión</button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {GROUPS.map((g) => (
          <div key={g.title} className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-text-primary">{g.title}</h3><span className="text-[11px] text-text-muted">{g.decision}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {g.fields.map((f) => (
                <label key={f.key} className="text-xs text-text-muted">
                  <span className={patch[f.key] !== undefined ? 'text-brand-amber' : ''}>{f.label}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" step={f.step ?? 1} value={f.pct ? Math.round(cur[f.key] * 1000) / 10 : cur[f.key]} disabled={!can('admin')}
                      onChange={(e) => setNum(f.key, e.target.value === '' ? '' : String(f.pct ? Number(e.target.value) / 100 : Number(e.target.value)))} className={`${inputCls} w-32`} />
                    {f.pct && <span className="text-text-muted">%</span>}
                  </div>
                  {f.hint && <span className="text-[11px] text-text-muted">{f.hint}</span>}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-text-primary">Estacionalidad</h3><span className="text-[11px] text-text-muted">factor por mes calendario · vacío = 1</span></div>
          <div className="grid grid-cols-6 gap-2">
            {MONTHS.map((m, i) => (
              <label key={m} className="text-[11px] text-text-muted text-center">{MONTH_NAMES[i]}
                <input type="number" step={0.1} min={0} value={cur.seasonalFactors?.[m] ?? ''} placeholder="1" disabled={!can('admin')} onChange={(e) => setMap('seasonalFactors', m, e.target.value)} className={`${inputCls} w-full mt-1 text-center`} />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">Diciembre 2,4 y enero 1,7 salen de la historia 2025; el resto se revisa en enero 2027 con dos años de solape (D2).</p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-text-primary">Crecimiento por categoría</h3><span className="text-[11px] text-text-muted">D3 · vacío = {Math.round(cur.growthDefault * 100)} % general</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
            {categories.map((c) => (
              <label key={c} className="text-[11px] text-text-muted truncate" title={c}>{c}
                <div className="flex items-center gap-1 mt-1">
                  <input type="number" step={5} value={cur.growthByCategory?.[c] !== undefined ? Math.round(cur.growthByCategory[c] * 100) : ''} placeholder={String(Math.round(cur.growthDefault * 100))} disabled={!can('admin')}
                    onChange={(e) => setMap('growthByCategory', c, e.target.value === '' ? '' : String(Number(e.target.value) / 100))} className={`${inputCls} w-full`} />
                  <span>%</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-text-primary">Nivel de servicio y exhibición</h3><span className="text-[11px] text-text-muted">por clase ABC</span></div>
          <div className="grid grid-cols-3 gap-3">
            {['A', 'B', 'C'].map((k) => (
              <div key={k} className="space-y-2">
                <div className="text-xs font-semibold text-text-primary">Clase {k}</div>
                <label className="text-[11px] text-text-muted block">Z (referencia)<input type="number" step={0.05} value={cur.zByClass?.[k] ?? ''} disabled={!can('admin')} onChange={(e) => setMap('zByClass', k, e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
                <label className="text-[11px] text-text-muted block">Mínimo en tienda (u.)<input type="number" step={1} min={0} value={cur.storeDisplayMin?.[k] ?? ''} disabled={!can('admin')} onChange={(e) => setMap('storeDisplayMin', k, e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <EventsSection categories={categories} canEdit={can('admin', 'supervisor')} canDelete={can('admin')} />

      {history && history.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">Versiones</h3>
          <TableShell headers={['Versión', 'Fecha', 'Quién', 'Motivo']}>
            {history.map((h) => (
              <tr key={h.version} className="border-b border-border-secondary">
                <td className="px-3 py-2 font-mono text-xs text-brand-blue">v{h.version}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{h.createdAt ? format(new Date(h.createdAt), 'dd-MM-yyyy HH:mm') : '—'}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{h.changedBy || '—'}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{h.changeNote || '—'}</td>
              </tr>
            ))}
          </TableShell>
        </div>
      )}
    </div>
  );
}

interface EventDraft { id?: string; name: string; from: string; to: string; categories: string[]; skus: string; uplift: number; notes: string }
const emptyEvent = (): EventDraft => ({ name: '', from: '', to: '', categories: [], skus: '', uplift: 1.3, notes: '' });

function EventsSection({ categories, canEdit, canDelete }: { categories: string[]; canEdit: boolean; canDelete: boolean }) {
  const { data: events } = useDemandEvents();
  const save = useSaveDemandEvent();
  const remove = useDeleteDemandEvent();
  const [draft, setDraft] = useState<EventDraft | null>(null);

  const submit = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.from || !draft.to || draft.uplift <= 0) { toast.error('Nombre, fechas y multiplicador mayor a 0'); return; }
    if (draft.to < draft.from) { toast.error('La fecha final es anterior a la inicial'); return; }
    try {
      await save.mutateAsync({ id: draft.id, data: {
        name: draft.name.trim(), from: draft.from, to: draft.to, categories: draft.categories,
        skus: draft.skus.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean), uplift: draft.uplift, notes: draft.notes,
      } });
      toast.success('Evento guardado; aplica en la próxima corrida');
      setDraft(null);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const toggle = async (ev: DemandEvent) => {
    try { await save.mutateAsync({ id: ev._id, data: { isActive: !ev.isActive } }); } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const del = async (ev: DemandEvent) => {
    if (!(await confirmDialog({ title: 'Eliminar evento', detail: `${ev.name} deja de aplicar en las próximas corridas. Las ya hechas no cambian.`, confirmLabel: 'Eliminar', danger: true }))) return;
    try { await remove.mutateAsync(ev._id); toast.success('Evento eliminado'); } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const scope = (ev: DemandEvent) => ev.skus.length ? `${ev.skus.length} SKU` : ev.categories.length ? ev.categories.join(', ') : 'Todo el catálogo';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Eventos de demanda</h3>
        <span className="text-[11px] text-text-muted">Cyber, campañas, temporadas: multiplican el pronóstico de los meses que cubren y la corrida lo deja escrito</span>
        <span className="flex-1" />
        {canEdit && !draft && <button onClick={() => setDraft(emptyEvent())} className={btnPrimary}>Nuevo evento</button>}
      </div>

      {draft && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-xs text-text-muted">Nombre<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${inputCls} w-full mt-1`} placeholder="Cyber Day" /></label>
            <label className="text-xs text-text-muted">Desde<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${inputCls} w-full mt-1`} /></label>
            <label className="text-xs text-text-muted">Hasta<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={`${inputCls} w-full mt-1`} /></label>
            <label className="text-xs text-text-muted">Multiplicador
              <div className="flex items-center gap-2 mt-1"><input type="number" step={0.1} min={0} value={draft.uplift} onChange={(e) => setDraft({ ...draft, uplift: Number(e.target.value) })} className={`${inputCls} w-24`} /><span className="text-text-muted">= {draft.uplift >= 1 ? '+' : ''}{Math.round((draft.uplift - 1) * 100)} %</span></div>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="text-xs text-text-muted">Categorías <span className="text-[11px]">(ninguna = todas)</span>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                {categories.map((c) => {
                  const on = draft.categories.includes(c);
                  return <button key={c} onClick={() => setDraft({ ...draft, categories: on ? draft.categories.filter((x) => x !== c) : [...draft.categories, c] })} className={`px-2 py-0.5 text-[11px] rounded-md border ${on ? 'border-brand-blue bg-brand-blue/20 text-text-primary' : 'border-border-primary text-text-muted'}`}>{c}</button>;
                })}
              </div>
            </div>
            <label className="text-xs text-text-muted">SKU puntuales <span className="text-[11px]">(separados por coma; tienen prioridad)</span>
              <textarea value={draft.skus} onChange={(e) => setDraft({ ...draft, skus: e.target.value })} className={`${inputCls} w-full mt-1 h-16 font-mono`} />
            </label>
          </div>
          <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={`${inputCls} w-full`} placeholder="Notas (de dónde sale el multiplicador)" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDraft(null)} className={btnGhost}>Cancelar</button>
            <button onClick={submit} disabled={save.isPending} className={btnPrimary}>{draft.id ? 'Guardar' : 'Crear evento'}</button>
          </div>
        </div>
      )}

      <TableShell headers={['Evento', 'Período', 'Alcance', 'Multiplicador', 'Estado', '']}>
        {(events ?? []).length === 0 && <Empty colSpan={6} text="Sin eventos. Sin ellos el motor usa solo la estacionalidad de calendario." />}
        {(events ?? []).map((ev) => (
          <tr key={ev._id} className="border-b border-border-secondary">
            <td className="px-3 py-2 text-xs text-text-primary">{ev.name}{ev.notes && <div className="text-[11px] text-text-muted">{ev.notes}</div>}</td>
            <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{fmtIsoDay(ev.from)} → {fmtIsoDay(ev.to)}</td>
            <td className="px-3 py-2 text-xs text-text-secondary max-w-[260px] truncate" title={scope(ev)}>{scope(ev)}</td>
            <td className="px-3 py-2 text-xs text-text-primary">×{ev.uplift} <span className="text-text-muted">({ev.uplift >= 1 ? '+' : ''}{Math.round((ev.uplift - 1) * 100)} %)</span></td>
            <td className="px-3 py-2"><Badge label={ev.isActive ? 'Activo' : 'Pausado'} variant={ev.isActive ? 'green' : 'gray'} /></td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {canEdit && <button onClick={() => setDraft({ id: ev._id, name: ev.name, from: ev.from.slice(0, 10), to: ev.to.slice(0, 10), categories: ev.categories, skus: ev.skus.join(', '), uplift: ev.uplift, notes: ev.notes })} className={`${btnGhost} mr-1`}>Editar</button>}
              {canEdit && <button onClick={() => toggle(ev)} className={`${btnGhost} mr-1`}>{ev.isActive ? 'Pausar' : 'Activar'}</button>}
              {canDelete && <button onClick={() => del(ev)} className={`${btnGhost} text-brand-red`}>Eliminar</button>}
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}
