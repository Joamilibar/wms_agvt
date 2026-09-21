import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  useProjects, useSaveProject, useProjectAction, usePlanningItems, usePlanningWarehouses,
  type ProjectDemand, type ProjectStatus, type ProjectCoverageLine,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import { confirmDialog } from '../../lib/confirm';
import KpiCard from '../ui/KpiCard';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary, fmtInt, fmtIsoDay } from './ui-helpers';
import type { BadgeVariant } from '../../lib/status';

const STATUS: Record<ProjectStatus, [string, BadgeVariant]> = {
  quote: ['Cotización', 'gray'], confirmed: ['Confirmado', 'blue'], delivered: ['Entregado', 'green'], cancelled: ['Anulado', 'gray'],
};

interface DraftLine { sku: string; qty: number }
interface Draft { id?: string; customer: string; rut: string; requiredDate: string; warehouse: string; notes: string; lines: DraftLine[] }
const emptyDraft = (): Draft => ({ customer: '', rut: '', requiredDate: '', warehouse: '', notes: '', lines: [{ sku: '', qty: 0 }] });

/**
 * B2B projects as a pipeline (phase 4). A quote only shows its coverage;
 * confirming creates a picking that reserves the units, so the engine and
 * the store stop counting them. Delivery closes it once the picking is done.
 */
export default function ProjectsTab() {
  const can = useAuthStore((s) => s.can);
  const { data, isLoading } = useProjects();
  const save = useSaveProject();
  const act = useProjectAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const items = (data?.items ?? []).filter((p) => filter === 'all' || p.status === 'quote' || p.status === 'confirmed');
  const open = (data?.items ?? []).filter((p) => p.status === 'quote' || p.status === 'confirmed');
  const uncovered = open.filter((p) => (data?.coverage[p._id] ?? []).some((l) => !l.covered));
  const unitsConfirmed = open.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.lines.reduce((a, l) => a + l.qty, 0), 0);
  const unitsQuoted = open.filter((p) => p.status === 'quote').reduce((s, p) => s + p.lines.reduce((a, l) => a + l.qty, 0), 0);

  const submit = async () => {
    if (!draft) return;
    const lines = draft.lines.filter((l) => l.sku.trim() && l.qty > 0).map((l) => ({ sku: l.sku.trim(), qty: l.qty }));
    if (!draft.customer.trim() || lines.length === 0) { toast.error('Cliente y al menos una línea con cantidad'); return; }
    try {
      const p = await save.mutateAsync({ id: draft.id, data: {
        customer: draft.customer.trim(), rut: draft.rut.trim() || undefined, requiredDate: draft.requiredDate || undefined,
        warehouse: draft.warehouse || undefined, notes: draft.notes, lines,
      } });
      toast.success(`${p.number} guardado`);
      setDraft(null);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const run = async (p: ProjectDemand, action: 'confirm' | 'deliver' | 'cancel') => {
    const units = p.lines.reduce((s, l) => s + l.qty, 0);
    const texts = {
      confirm: { title: 'Confirmar proyecto', detail: `Se crea un picking en ${p.warehouse} que reserva ${fmtInt(units)} unidades para ${p.customer}. Lo que no alcance queda como faltante visible.` },
      deliver: { title: 'Marcar entregado', detail: 'Requiere que el picking del proyecto esté completado.' },
      cancel: { title: 'Anular proyecto', detail: p.orderNumber ? `Se anula el picking ${p.orderNumber} y se liberan las reservas.` : 'La cotización desaparece del pipeline.', danger: true },
    }[action];
    if (!(await confirmDialog({ ...texts, confirmLabel: texts.title.split(' ')[0] }))) return;
    try { await act.mutateAsync({ id: p._id, action }); toast.success(`${p.number}: ${STATUS[action === 'confirm' ? 'confirmed' : action === 'deliver' ? 'delivered' : 'cancelled'][0].toLowerCase()}`); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading || !data) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Abiertos" value={open.length} subtitle={`${open.filter((p) => p.status === 'quote').length} cotizaciones · ${open.filter((p) => p.status === 'confirmed').length} confirmados`} color="blue" />
        <KpiCard title="Unidades confirmadas" value={fmtInt(unitsConfirmed)} subtitle="Reservadas en bodega" color="purple" />
        <KpiCard title="Unidades cotizadas" value={fmtInt(unitsQuoted)} subtitle="Sin reserva; sirven para cubrir MOQ" color="gray" />
        <KpiCard title="Sin cobertura" value={uncovered.length} subtitle="Proyectos con alguna línea sin stock ni pedido" color={uncovered.length ? 'red' : 'green'} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border border-border-primary rounded-lg p-0.5">
          {(['open', 'all'] as const).map((v) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1 text-xs rounded-md ${filter === v ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-primary'}`}>{v === 'open' ? 'Abiertos' : 'Todos'}</button>
          ))}
        </div>
        <span className="flex-1" />
        {can('admin', 'supervisor') && !draft && <button onClick={() => setDraft(emptyDraft())} className={btnPrimary}>Nuevo proyecto</button>}
      </div>

      {draft && <ProjectForm draft={draft} onChange={setDraft} onSubmit={submit} onCancel={() => setDraft(null)} saving={save.isPending} />}

      <TableShell headers={['Proyecto', 'Cliente', 'Estado', 'Fecha requerida', 'Líneas', 'Unidades', 'Cobertura', 'Picking', '']}>
        {items.length === 0 && <Empty colSpan={9} text={filter === 'open' ? 'Sin proyectos abiertos' : 'Sin proyectos'} />}
        {items.map((p) => {
          const cov = data.coverage[p._id] ?? [];
          const short = cov.filter((l) => !l.covered);
          return (
            <ProjectRow key={p._id} p={p} cov={cov} short={short} canEdit={can('admin', 'supervisor')}
              onEdit={() => setDraft({ id: p._id, customer: p.customer, rut: p.rut ?? '', requiredDate: p.requiredDate ? p.requiredDate.slice(0, 10) : '', warehouse: p.warehouse, notes: p.notes, lines: p.lines.map((l) => ({ sku: l.sku, qty: l.qty })) })}
              onAction={(a) => run(p, a)} />
          );
        })}
      </TableShell>
      <p className="text-xs text-text-muted">Regla D1: la demanda de proyectos no entra en la serie de retail. Aquí vive como pipeline; al confirmar, la reserva baja el disponible que ve el motor.</p>
    </div>
  );
}

function ProjectRow({ p, cov, short, canEdit, onEdit, onAction }: {
  p: ProjectDemand; cov: ProjectCoverageLine[]; short: ProjectCoverageLine[]; canEdit: boolean; onEdit: () => void; onAction: (a: 'confirm' | 'deliver' | 'cancel') => void;
}) {
  const [openLines, setOpenLines] = useState(false);
  const units = p.lines.reduce((s, l) => s + l.qty, 0);
  const [label, variant] = STATUS[p.status];
  const isOpen = p.status === 'quote' || p.status === 'confirmed';
  return (
    <>
      <tr className="border-b border-border-secondary">
        <td className="px-3 py-2 font-mono text-xs text-brand-blue">{p.number}</td>
        <td className="px-3 py-2 text-xs text-text-primary">{p.customer}{p.rut && <div className="text-[11px] text-text-muted">{p.rut}</div>}</td>
        <td className="px-3 py-2"><Badge label={label} variant={variant} /></td>
        <td className="px-3 py-2 text-xs text-text-secondary">{p.requiredDate ? fmtIsoDay(p.requiredDate) : '—'}</td>
        <td className="px-3 py-2 text-xs"><button onClick={() => setOpenLines((v) => !v)} className="text-brand-blue hover:underline">{p.lines.length} {openLines ? '▾' : '▸'}</button></td>
        <td className="px-3 py-2 text-xs text-text-secondary">{fmtInt(units)}</td>
        <td className="px-3 py-2">
          {!isOpen ? <span className="text-xs text-text-muted">—</span>
            : short.length === 0 ? <Badge label="Cubierto" variant="green" />
            : <Badge label={`${short.length} línea${short.length > 1 ? 's' : ''} sin cubrir`} variant={p.status === 'confirmed' ? 'red' : 'amber'} />}
        </td>
        <td className="px-3 py-2 font-mono text-xs text-text-secondary">{p.orderNumber ?? '—'}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {canEdit && p.status === 'quote' && <button onClick={onEdit} className={`${btnGhost} mr-1`}>Editar</button>}
          {canEdit && p.status === 'quote' && <button onClick={() => onAction('confirm')} className={`${btnGhost} mr-1`}>Confirmar</button>}
          {canEdit && p.status === 'confirmed' && <button onClick={() => onAction('deliver')} className={`${btnGhost} mr-1`}>Entregado</button>}
          {canEdit && isOpen && <button onClick={() => onAction('cancel')} className={`${btnGhost} text-brand-red`}>Anular</button>}
        </td>
      </tr>
      {openLines && (
        <tr className="border-b border-border-secondary bg-bg-tertiary/40">
          <td colSpan={9} className="px-4 py-2">
            <table className="text-xs w-full max-w-3xl">
              <thead><tr className="text-text-muted"><th className="text-left py-1 pr-3">SKU</th><th className="text-left py-1 pr-3">Producto</th><th className="text-right py-1 pr-3">Pedido</th><th className="text-right py-1 pr-3">Disponible</th><th className="text-right py-1 pr-3">En tránsito</th><th className="text-left py-1">Cobertura</th></tr></thead>
              <tbody>
                {p.lines.map((l) => {
                  const c = cov.find((x) => x.sku === l.sku);
                  return (
                    <tr key={l.sku}>
                      <td className="py-1 pr-3 font-mono text-brand-blue">{l.sku}</td>
                      <td className="py-1 pr-3 text-text-primary">{l.name || <span className="text-text-muted">no está en abastecimiento</span>}</td>
                      <td className="py-1 pr-3 text-right text-text-secondary">{fmtInt(l.qty)}</td>
                      <td className="py-1 pr-3 text-right text-text-secondary">{c ? fmtInt(c.available) : '—'}</td>
                      <td className="py-1 pr-3 text-right text-text-secondary">{c ? fmtInt(c.inTransit) : '—'}</td>
                      <td className="py-1">{!isOpen || !c ? '—' : c.covered ? <span className="text-brand-green">cubierta</span> : <span className="text-brand-red">falta {fmtInt(Math.max(0, l.qty - c.available - c.inTransit))}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {p.notes && <p className="mt-2 text-[11px] text-text-muted">{p.notes}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function ProjectForm({ draft, onChange, onSubmit, onCancel, saving }: { draft: Draft; onChange: (d: Draft) => void; onSubmit: () => void; onCancel: () => void; saving: boolean }) {
  const { data: warehouses } = usePlanningWarehouses();
  const { data: catalog } = usePlanningItems({});
  const names = new Map((catalog ?? []).map((i) => [i.sku, i.name]));
  const setLine = (i: number, patch: Partial<DraftLine>) => onChange({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">{draft.id ? 'Editar cotización' : 'Nuevo proyecto'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-xs text-text-muted">Cliente<input value={draft.customer} onChange={(e) => onChange({ ...draft, customer: e.target.value })} className={`${inputCls} w-full mt-1`} placeholder="Hotel …" /></label>
        <label className="text-xs text-text-muted">RUT<input value={draft.rut} onChange={(e) => onChange({ ...draft, rut: e.target.value })} className={`${inputCls} w-full mt-1`} placeholder="76.xxx.xxx-x" /></label>
        <label className="text-xs text-text-muted">Fecha requerida<input type="date" value={draft.requiredDate} onChange={(e) => onChange({ ...draft, requiredDate: e.target.value })} className={`${inputCls} w-full mt-1`} /></label>
        <label className="text-xs text-text-muted">Bodega que reserva
          <select value={draft.warehouse} onChange={(e) => onChange({ ...draft, warehouse: e.target.value })} className={`${selectCls} w-full mt-1`}>
            <option value="">Bodega Virtual Tienda</option>
            {(warehouses ?? []).filter((w) => w.isActive).map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-1">
        {draft.lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value })} className={`${inputCls} w-44 font-mono`} placeholder="SKU" list="planning-skus" />
            <span className="text-xs text-text-secondary flex-1 min-w-[160px] truncate">{names.get(l.sku.trim()) ?? (l.sku.trim() ? <span className="text-text-muted">SKU fuera de abastecimiento</span> : '')}</span>
            <input type="number" min={0} value={l.qty || ''} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} className={`${inputCls} w-24`} placeholder="cant." />
            <button onClick={() => onChange({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })} className={btnGhost} disabled={draft.lines.length === 1}>×</button>
          </div>
        ))}
        <datalist id="planning-skus">{(catalog ?? []).slice(0, 800).map((i) => <option key={i.sku} value={i.sku}>{i.name}</option>)}</datalist>
        <button onClick={() => onChange({ ...draft, lines: [...draft.lines, { sku: '', qty: 0 }] })} className={btnGhost}>+ línea</button>
      </div>
      <input value={draft.notes} onChange={(e) => onChange({ ...draft, notes: e.target.value })} className={`${inputCls} w-full`} placeholder="Notas (licitación, condiciones, contacto)" />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className={btnGhost}>Cancelar</button>
        <button onClick={onSubmit} disabled={saving} className={btnPrimary}>{draft.id ? 'Guardar cambios' : 'Crear cotización'}</button>
      </div>
    </div>
  );
}
