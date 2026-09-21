import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  useProductionPlan, useProductionOrders, useCreateProductionOrder, useProductionOrderAction,
  type ProductionOrder, type MaterialRequirement,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import { confirmDialog } from '../../lib/confirm';
import KpiCard from '../ui/KpiCard';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary, fmtInt } from './ui-helpers';
import type { BadgeVariant } from '../../lib/status';

const OP_STATUS: Record<ProductionOrder['status'], [string, BadgeVariant]> = {
  draft: ['Borrador', 'gray'], approved: ['Aprobada', 'blue'], in_progress: ['En producción', 'purple'], completed: ['Completada', 'green'], cancelled: ['Anulada', 'gray'],
};
const fmtQty = (n: number, uom: string) => (uom === 'un' ? fmtInt(Math.ceil(n)) : `${(Math.round(n * 100) / 100).toLocaleString('es-CL')} ${uom}`);

/**
 * Production (D8/D9): what the run says to make, the materials it takes
 * netted against the workshops, and the orders that consume them and create
 * the finished lot. No capacity limit yet.
 */
export default function ProductionTab() {
  const can = useAuthStore((s) => s.can);
  const [qty, setQty] = useState<Record<string, number> | null>(null);
  const requests = useMemo(() => (qty ? Object.entries(qty).map(([sku, q]) => ({ sku, qty: q })) : null), [qty]);
  const { data: plan, isLoading, isFetching } = useProductionPlan(requests);
  const { data: orders } = useProductionOrders();
  const createOp = useCreateProductionOrder();
  const opAction = useProductionOrderAction();
  const [view, setView] = useState<'plan' | 'orders'>('plan');
  const [workshop, setWorkshop] = useState('');
  const [completing, setCompleting] = useState<ProductionOrder | null>(null);

  const setOne = (sku: string, q: number) => {
    const base = qty ?? Object.fromEntries((plan?.candidates ?? []).map((c) => [c.sku, c.suggested]));
    setQty({ ...base, [sku]: q });
  };
  const current = (sku: string, suggested: number) => qty?.[sku] ?? suggested;

  const createOrder = async () => {
    if (!plan) return;
    const ws = workshop || plan.workshops[0];
    if (!ws) { toast.error('No hay talleres activos'); return; }
    const lines = plan.candidates.filter((c) => c.hasRecipe && current(c.sku, c.suggested) > 0).map((c) => ({ sku: c.sku, qty: current(c.sku, c.suggested), reason: current(c.sku, c.suggested) !== c.suggested ? 'ajustado en pantalla' : undefined }));
    if (lines.length === 0) { toast.error('Nada con receta que producir'); return; }
    try {
      const op = await createOp.mutateAsync({ workshop: ws, lines, notes: plan.runNumber ? `Desde corrida ${plan.runNumber}` : '' });
      toast.success(`${op.number} en borrador: ${op.lines.length} productos`);
      setView('orders');
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const act = async (op: ProductionOrder, action: 'approve' | 'start' | 'cancel') => {
    const texts = { approve: { title: 'Aprobar', detail: `${op.number} queda lista para el taller ${op.workshop}.` }, start: { title: 'Iniciar', detail: 'Marca la orden en producción.' }, cancel: { title: 'Anular', detail: 'La orden no consume nada.', danger: true } }[action];
    if (!(await confirmDialog({ ...texts, confirmLabel: texts.title }))) return;
    try { await opAction.mutateAsync({ id: op._id, action }); toast.success(`${op.number}: ${texts.title.toLowerCase()}`); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading || !plan) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted">Candidatos de la corrida <span className="font-mono text-brand-blue">{plan.runNumber ?? '—'}</span> · insumos contra {plan.productionWarehouses.join(', ')}{isFetching ? ' …' : ''}</span>
        <span className="flex-1" />
        <div className="flex gap-1 border border-border-primary rounded-lg p-0.5">
          {(['plan', 'orders'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs rounded-md ${view === v ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-primary'}`}>{v === 'plan' ? 'Plan y materia prima' : `Órdenes (${orders?.length ?? 0})`}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="A producir" value={`${plan.summary.products} SKU`} subtitle={`${fmtInt(plan.summary.units)} u.`} color="blue" />
        <KpiCard title="Sin receta" value={plan.missingRecipes.length} subtitle="No se pueden explotar" color={plan.missingRecipes.length ? 'amber' : 'gray'} />
        <KpiCard title="Duvet (770 + 850 FP)" value={`${plan.summary.kgDown} kg`} subtitle="Requerido con merma" color="purple" />
        <KpiCard title="Pluma 3–5 cm" value={`${plan.summary.kgFeathers} kg`} subtitle="Requerido con merma" color="purple" />
        <KpiCard title="Insumos" value={plan.summary.materials} subtitle="Distintos" color="gray" />
        <KpiCard title="Faltantes" value={plan.summary.shortages} subtitle="Insumos sin cobertura" color={plan.summary.shortages ? 'red' : 'green'} />
      </div>

      {view === 'plan' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Qué producir</h3>
            <span className="flex-1" />
            {can('admin', 'supervisor') && (
              <>
                <select value={workshop || plan.workshops[0] || ''} onChange={(e) => setWorkshop(e.target.value)} className={selectCls}>
                  {plan.workshops.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
                {qty && <button onClick={() => setQty(null)} className={btnGhost}>Volver a lo sugerido</button>}
                <button onClick={createOrder} disabled={createOp.isPending} className={btnPrimary}>Crear orden de producción</button>
              </>
            )}
          </div>
          <TableShell headers={['SKU', 'Producto', 'Estado', 'Sugerido', 'Cantidad', 'Receta']}>
            {plan.candidates.length === 0 && <Empty colSpan={6} text="La corrida no sugiere nacionales" />}
            {plan.candidates.map((c) => (
              <tr key={c.sku} className="border-b border-border-secondary">
                <td className="px-3 py-2 font-mono text-xs text-brand-blue">{c.sku}</td>
                <td className="px-3 py-2 text-xs text-text-primary max-w-[300px] truncate" title={c.name}>{c.name || '—'}<div className="text-[11px] text-text-muted">{c.category}</div></td>
                <td className="px-3 py-2"><Badge label={c.state === 'QUIEBRE' ? 'Quiebre' : c.state === 'REPONER' ? 'Reponer' : c.state} variant={c.state === 'QUIEBRE' ? 'red' : 'amber'} /></td>
                <td className="px-3 py-2 text-xs text-text-secondary">{fmtInt(c.suggested)}</td>
                <td className="px-3 py-2">
                  {can('admin', 'supervisor') && c.hasRecipe
                    ? <input type="number" min={0} value={current(c.sku, c.suggested)} onChange={(e) => setOne(c.sku, Number(e.target.value))} className={`${inputCls} w-20`} />
                    : <span className="text-xs text-text-secondary">{fmtInt(current(c.sku, c.suggested))}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{c.hasRecipe ? <span className="text-text-muted">v{c.recipeVersion}</span> : <Badge label="sin receta" variant="amber" />}</td>
              </tr>
            ))}
          </TableShell>

          <h3 className="text-sm font-semibold text-text-primary">Materia prima e insumos</h3>
          <TableShell headers={['SKU', 'Insumo', 'Requerido', 'En bodega/taller', 'En pedido', 'Falta', 'Para']}>
            {plan.materials.length === 0 && <Empty colSpan={7} text="Nada que explotar" />}
            {plan.materials.map((m) => <MaterialRow key={m.sku} m={m} />)}
          </TableShell>
          {plan.intermediates.length > 0 && (
            <p className="text-xs text-text-muted">Intermedios a fabricar primero: {plan.intermediates.map((i) => `${i.name || i.sku} (${fmtQty(i.required, i.uom)})`).join(' · ')}</p>
          )}
        </>
      ) : (
        <TableShell headers={['Orden', 'Taller', 'Estado', 'Productos', 'Unidades', 'Lotes', 'Creada', '']}>
          {orders?.length === 0 && <Empty colSpan={8} text="Sin órdenes de producción" />}
          {orders?.map((op) => {
            const [label, variant] = OP_STATUS[op.status];
            return (
              <tr key={op._id} className="border-b border-border-secondary">
                <td className="px-3 py-2 font-mono text-xs text-brand-blue">{op.number}<div className="text-[11px] text-text-muted font-sans">→ {op.destinationWarehouse}</div></td>
                <td className="px-3 py-2 text-xs text-text-secondary">{op.workshop}</td>
                <td className="px-3 py-2"><Badge label={label} variant={variant} /></td>
                <td className="px-3 py-2 text-xs text-text-primary">{op.lines.map((l) => `${l.name || l.sku} ×${l.qty}`).join(', ')}</td>
                <td className="px-3 py-2 font-semibold text-text-primary">{fmtInt(op.lines.reduce((s, l) => s + l.qty, 0))}{op.status === 'completed' && <span className="text-xs text-text-muted"> / {fmtInt(op.lines.reduce((s, l) => s + l.qtyProduced, 0))} hechas</span>}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-text-secondary">{op.producedLots.join(', ') || '—'}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{format(new Date(op.createdAt), 'dd-MM-yyyy')}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {can('admin', 'supervisor') && op.status === 'draft' && <button onClick={() => act(op, 'approve')} className={btnPrimary}>Aprobar</button>}
                  {can('admin', 'supervisor') && op.status === 'approved' && <button onClick={() => act(op, 'start')} className={`${btnGhost} ml-1`}>Iniciar</button>}
                  {can('admin', 'supervisor') && (op.status === 'approved' || op.status === 'in_progress') && <button onClick={() => setCompleting(op)} className={`${btnPrimary} ml-1`}>Completar</button>}
                  {can('admin', 'supervisor') && op.status !== 'completed' && op.status !== 'cancelled' && <button onClick={() => act(op, 'cancel')} className={`${btnGhost} ml-1`}>Anular</button>}
                </td>
              </tr>
            );
          })}
        </TableShell>
      )}
      {completing && <CompleteForm op={completing} onClose={() => setCompleting(null)} />}
    </div>
  );
}

function MaterialRow({ m }: { m: MaterialRequirement }) {
  return (
    <tr className="border-b border-border-secondary">
      <td className="px-3 py-2 font-mono text-xs text-brand-blue">{m.sku}</td>
      <td className="px-3 py-2 text-xs text-text-primary max-w-[320px] truncate" title={m.name}>{m.name || '—'}</td>
      <td className="px-3 py-2 text-xs font-semibold text-text-primary">{fmtQty(m.required, m.uom)}</td>
      <td className="px-3 py-2 text-xs text-text-secondary">{fmtQty(m.available, m.uom)}</td>
      <td className="px-3 py-2 text-xs text-text-secondary">{m.onOrder ? fmtQty(m.onOrder, m.uom) : '—'}</td>
      <td className={`px-3 py-2 text-xs font-semibold ${m.shortage > 0 ? 'text-brand-red' : 'text-brand-green'}`}>{m.shortage > 0 ? fmtQty(m.shortage, m.uom) : 'cubierto'}</td>
      <td className="px-3 py-2 text-[11px] text-text-muted">{m.from.length} producto(s)</td>
    </tr>
  );
}

function CompleteForm({ op, onClose }: { op: ProductionOrder; onClose: () => void }) {
  const action = useProductionOrderAction();
  const [made, setMade] = useState<Record<string, number>>(() => Object.fromEntries(op.lines.map((l) => [l.sku, l.qty - l.qtyProduced])));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const produced = op.lines.map((l) => ({ sku: l.sku, qty: made[l.sku] ?? 0 })).filter((l) => l.qty > 0);
    if (produced.length === 0) { toast.error('Indica lo producido'); return; }
    try {
      const res = await action.mutateAsync({ id: op._id, action: 'complete', body: { produced } }) as { lots: string[] };
      toast.success(`${op.number}: ${res.lots.length} lotes creados en ${op.destinationWarehouse}; insumos descontados en ${op.workshop}. Regístralo en BSale.`, { duration: 7000 });
      onClose();
    } catch (err) { toast.error('No se pudo completar: ' + getErrorMessage(err)); }
  };
  return (
    <form onSubmit={submit} className="bg-bg-secondary border border-brand-blue/40 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Completar {op.number} · {op.workshop} → {op.destinationWarehouse}</h3>
        <span className="flex-1" />
        <button type="submit" disabled={action.isPending} className={btnPrimary}>Confirmar</button>
        <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-text-muted uppercase tracking-wider"><th className="px-2 py-1 text-left">SKU</th><th className="px-2 py-1 text-left">Producto</th><th className="px-2 py-1 text-left">Pendiente</th><th className="px-2 py-1 text-left">Producido ahora</th></tr></thead>
        <tbody>
          {op.lines.map((l) => (
            <tr key={l.sku} className="text-text-secondary">
              <td className="px-2 py-1 font-mono">{l.sku}</td>
              <td className="px-2 py-1">{l.name}</td>
              <td className="px-2 py-1">{fmtInt(l.qty - l.qtyProduced)}</td>
              <td className="px-2 py-1"><input type="number" min={0} value={made[l.sku] ?? 0} onChange={(e) => setMade({ ...made, [l.sku]: Number(e.target.value) })} className={`${inputCls} w-24`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-text-muted">Se consumen los insumos de la receta (FIFO, primero en el taller de la orden) y se crea un lote por producto con el costo de lo consumido.</p>
    </form>
  );
}
