import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  useStores, useStorePlan, useUpsertIdeals, useTransfers, useCreateTransfer, useTransferAction,
  type StorePlanRow, type StoreState, type TransferOrder,
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

const STATE_LABEL: Record<StoreState, string> = {
  ENVIAR: 'Enviar', FALTANTE_SIN_RESPALDO: 'Falta sin respaldo', RETIRO: 'Retirar', SOBRE_STOCK: 'Sobre stock', OK: 'OK', SIN_IDEAL: 'Sin ideal',
};
const STATE_VARIANT: Record<StoreState, BadgeVariant> = {
  ENVIAR: 'green', FALTANTE_SIN_RESPALDO: 'red', RETIRO: 'amber', SOBRE_STOCK: 'blue', OK: 'gray', SIN_IDEAL: 'gray',
};
const TSTATUS: Record<TransferOrder['status'], [string, BadgeVariant]> = {
  draft: ['Borrador', 'gray'], approved: ['Aprobada · picking', 'blue'], picking: ['En picking', 'purple'], delivered: ['Entregada', 'green'], cancelled: ['Anulada', 'gray'],
};

/**
 * Store replenishment (D10): the plan per SKU on the store's ideal — manual
 * or computed — with what to send, what has no backing in the warehouse and
 * what to bring back; and the transfers that drive the WMS picking.
 */
export default function StoreTab() {
  const can = useAuthStore((s) => s.can);
  const { data: stores } = useStores();
  const [chosenStore, setStore] = useState<string | null>(null);
  // The first active store is the default until the user picks another.
  const store = chosenStore ?? stores?.[0]?.store ?? null;
  const { data: plan, isLoading, isFetching } = useStorePlan(store);
  const { data: transfers } = useTransfers(store);
  const [view, setView] = useState<'plan' | 'transfers'>('plan');
  const [filter, setFilter] = useState<{ state: string; search: string }>({ state: '', search: '' });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [editingIdeal, setEditingIdeal] = useState<string | null>(null);
  const createTransfer = useCreateTransfer();
  const upsertIdeals = useUpsertIdeals();
  const transferAction = useTransferAction();

  const rows = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return (plan?.rows ?? []).filter((r) => (!filter.state || r.state === filter.state) && (!q || r.sku.includes(q) || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)));
  }, [plan, filter]);

  const sendQty = (r: StorePlanRow) => qty[r.sku] ?? r.send;
  const changed = (plan?.rows ?? []).filter((r) => qty[r.sku] !== undefined && qty[r.sku] !== r.send);
  const totalSend = (plan?.rows ?? []).reduce((s, r) => s + sendQty(r), 0);

  const createSend = async () => {
    if (!store) return;
    if (changed.some((r) => !reason[r.sku]?.trim())) { toast.error('Cada cantidad cambiada necesita un motivo'); return; }
    try {
      const t = await createTransfer.mutateAsync({ store, direction: 'send', overrides: changed.map((r) => ({ sku: r.sku, qty: qty[r.sku], reason: reason[r.sku] })) });
      toast.success(`${t.number}: ${t.lines.length} SKU en borrador`);
      setQty({}); setReason({}); setView('transfers');
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const createWithdraw = async () => {
    if (!store) return;
    try {
      const t = await createTransfer.mutateAsync({ store, direction: 'withdraw', overrides: [] });
      toast.success(`${t.number}: retiro de ${t.lines.length} SKU en borrador`);
      setView('transfers');
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const saveIdeal = async (sku: string, value: string) => {
    if (!store) return;
    try {
      await upsertIdeals.mutateAsync({ store, rows: [{ sku, ideal: value === '' ? null : Number(value) }] });
      toast.success(value === '' ? `${sku}: vuelve al ideal calculado` : `${sku}: ideal ${value}`);
    } catch (e) { toast.error(getErrorMessage(e)); }
    setEditingIdeal(null);
  };
  const act = async (t: TransferOrder, action: 'approve' | 'deliver' | 'cancel') => {
    const texts = {
      approve: { title: 'Aprobar', detail: `Crea la orden de picking en ${t.fromWarehouse} y reserva ${fmtInt(t.lines.reduce((s, l) => s + l.qtyApproved, 0))} u.` },
      deliver: { title: 'Marcar entregada', detail: `Crea los lotes en ${t.toWarehouse} con lo que tomó el picking. Registra el traslado también en BSale.` },
      cancel: { title: 'Anular', detail: 'Libera la reserva si el picking no se completó.', danger: true },
    }[action];
    if (!(await confirmDialog({ ...texts, confirmLabel: texts.title }))) return;
    try {
      await transferAction.mutateAsync({ id: t._id, action });
      toast.success(`${t.number}: ${action === 'approve' ? 'aprobada, picking creado' : action === 'deliver' ? 'entregada' : 'anulada'}`);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading || !plan) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={store ?? ''} onChange={(e) => setStore(e.target.value)} className={selectCls}>
          {(stores ?? []).map((s) => <option key={s.store} value={s.store}>{s.store}</option>)}
        </select>
        <span className="text-xs text-text-muted">desde {plan.source} · ciclo {plan.params.cycleDays} d · ventana {plan.params.demandWindowDays} d · {plan.summary.deliveries} entrega(s) esta semana{isFetching ? ' …' : ''}</span>
        <span className="flex-1" />
        <div className="flex gap-1 border border-border-primary rounded-lg p-0.5">
          {(['plan', 'transfers'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs rounded-md ${view === v ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-primary'}`}>{v === 'plan' ? 'Plan' : `Transferencias (${transfers?.length ?? 0})`}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Enviar" value={`${plan.summary.ENVIAR ?? 0} SKU`} subtitle={`${fmtInt(plan.summary.sendUnits ?? 0)} u.`} color="green" />
        <KpiCard title="Falta sin respaldo" value={`${plan.summary.FALTANTE_SIN_RESPALDO ?? 0} SKU`} subtitle={`${fmtInt(plan.summary.uncoveredUnits ?? 0)} u. sin stock en bodega`} color="red" />
        <KpiCard title="Retirar" value={`${plan.summary.RETIRO ?? 0} SKU`} subtitle={`${fmtInt(plan.summary.withdrawUnits ?? 0)} u. sin venta en ${plan.params.withdrawAfterMonths} meses`} color="amber" />
        <KpiCard title="Sobre stock" value={plan.summary.SOBRE_STOCK ?? 0} subtitle="Más del doble del ideal" color="blue" />
        <KpiCard title="Ideales manuales" value={plan.summary.manualIdeals ?? 0} subtitle={`${plan.summary.computedIdeals ?? 0} calculados por venta`} color="purple" />
        <KpiCard title="OK" value={plan.summary.OK ?? 0} subtitle="Entre ideal y el doble" color="gray" />
      </div>

      {view === 'plan' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="SKU, nombre o categoría" className={`${inputCls} w-56`} />
            <select value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value })} className={selectCls}>
              <option value="">Todos los estados</option>
              {(Object.keys(STATE_LABEL) as StoreState[]).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
            </select>
            <span className="text-xs text-text-muted">{rows.length} SKU</span>
            <span className="flex-1" />
            {can('admin', 'supervisor') && (plan.summary.withdrawUnits ?? 0) > 0 && <button onClick={createWithdraw} disabled={createTransfer.isPending} className={btnGhost}>Crear retiro ({fmtInt(plan.summary.withdrawUnits ?? 0)} u.)</button>}
            {can('admin', 'supervisor') && <button onClick={createSend} disabled={createTransfer.isPending || totalSend <= 0} className={btnPrimary}>Crear envío ({fmtInt(totalSend)} u.)</button>}
          </div>
          <TableShell headers={['Estado', 'ABC', 'SKU', 'Producto', 'Venta/día', 'Ideal', 'Tienda', 'En camino', 'Bodega', 'Falta', 'Enviar', 'Retirar', 'Cobertura']}>
            {rows.length === 0 && <Empty colSpan={13} text="Ningún SKU coincide" />}
            {rows.map((r) => (
              <tr key={r.sku} className="border-b border-border-secondary hover:bg-bg-tertiary/50">
                <td className="px-2 py-2"><Badge label={STATE_LABEL[r.state]} variant={STATE_VARIANT[r.state]} />{r.reasons.length > 0 && <div className="text-[11px] text-brand-amber mt-1 max-w-[200px]">{r.reasons[0]}</div>}</td>
                <td className="px-2 py-2 font-semibold text-text-primary">{r.abc}</td>
                <td className="px-2 py-2 font-mono text-xs text-brand-blue">{r.sku}</td>
                <td className="px-2 py-2 text-xs text-text-primary max-w-[240px] truncate" title={r.name}>{r.name || '—'}<div className="text-[11px] text-text-muted">{r.category}</div></td>
                <td className="px-2 py-2 text-xs text-text-secondary">{r.dailyDemand.toFixed(2)}</td>
                <td className="px-2 py-2 text-xs">
                  {editingIdeal === r.sku ? (
                    <input type="number" min={0} autoFocus defaultValue={r.idealSource === 'manual' ? r.ideal : ''} placeholder="calculado"
                      onBlur={(e) => saveIdeal(r.sku, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingIdeal(null); }}
                      className={`${inputCls} w-20`} />
                  ) : (
                    <button onClick={() => can('admin', 'supervisor') && setEditingIdeal(r.sku)} className="text-left" title={r.idealSource === 'manual' ? 'Ideal manual (clic para cambiar; vacío = calculado)' : r.idealSource === 'computed' ? 'Calculado por la venta de la tienda (clic para fijar uno manual)' : 'Sin ideal'}>
                      <span className="font-semibold text-text-primary">{r.ideal}</span>
                      <span className={`ml-1 text-[10px] ${r.idealSource === 'manual' ? 'text-brand-purple' : r.idealSource === 'computed' ? 'text-brand-blue' : 'text-text-muted'}`}>{r.idealSource === 'manual' ? 'M' : r.idealSource === 'computed' ? 'C' : '—'}</span>
                    </button>
                  )}
                </td>
                <td className="px-2 py-2 text-xs text-text-primary font-semibold">{fmtInt(r.stockStore)}</td>
                <td className="px-2 py-2 text-xs text-text-secondary">{r.inTransit || '—'}</td>
                <td className="px-2 py-2 text-xs text-text-secondary">{fmtInt(r.availableSource)}</td>
                <td className={`px-2 py-2 text-xs ${r.need > r.send ? 'text-brand-red font-semibold' : 'text-text-secondary'}`}>{r.need || '—'}</td>
                <td className="px-2 py-2">
                  {r.state === 'ENVIAR' && can('admin', 'supervisor') ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={r.availableSource} value={sendQty(r)} onChange={(e) => setQty({ ...qty, [r.sku]: Number(e.target.value) })} className={`${inputCls} w-16 ${qty[r.sku] !== undefined && qty[r.sku] !== r.send ? 'border-brand-amber/60' : ''}`} />
                      {qty[r.sku] !== undefined && qty[r.sku] !== r.send && <input value={reason[r.sku] ?? ''} onChange={(e) => setReason({ ...reason, [r.sku]: e.target.value })} placeholder="motivo" className={`${inputCls} w-28`} />}
                    </div>
                  ) : <span className="text-xs text-text-secondary">{r.send || '—'}</span>}
                </td>
                <td className="px-2 py-2 text-xs text-brand-amber">{r.withdraw || '—'}</td>
                <td className="px-2 py-2 text-xs text-text-secondary">{r.coverageDays === null ? '—' : `${r.coverageDays} d`}</td>
              </tr>
            ))}
          </TableShell>
        </>
      ) : (
        <TableShell headers={['Transferencia', 'Sentido', 'Estado', 'Líneas', 'Unidades', 'Picking', 'Creada', '']}>
          {transfers?.length === 0 && <Empty colSpan={8} text="Sin transferencias" />}
          {transfers?.map((t) => {
            const [label, variant] = TSTATUS[t.status];
            const units = t.lines.reduce((s, l) => s + l.qtyApproved, 0);
            return (
              <tr key={t._id} className="border-b border-border-secondary">
                <td className="px-3 py-2 font-mono text-xs text-brand-blue">{t.number}<div className="text-[11px] text-text-muted font-sans">{t.fromWarehouse} → {t.toWarehouse}</div></td>
                <td className="px-3 py-2 text-xs text-text-secondary">{t.direction === 'send' ? 'Envío' : 'Retiro'}</td>
                <td className="px-3 py-2"><Badge label={label} variant={variant} /></td>
                <td className="px-3 py-2 text-text-secondary">{t.lines.length}</td>
                <td className="px-3 py-2 font-semibold text-text-primary">{fmtInt(units)}{t.status === 'delivered' && <span className="text-xs text-text-muted"> / {fmtInt(t.lines.reduce((s, l) => s + l.qtyDelivered, 0))} entregadas</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-secondary">{t.pickingOrderNumber ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{format(new Date(t.createdAt), 'dd-MM-yyyy')}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {can('admin', 'supervisor') && t.status === 'draft' && <button onClick={() => act(t, 'approve')} className={btnPrimary}>Aprobar</button>}
                  {can('admin', 'supervisor') && (t.status === 'approved' || t.status === 'picking') && <button onClick={() => act(t, 'deliver')} className={`${btnGhost} ml-1`}>Entregada</button>}
                  {can('admin', 'supervisor') && t.status !== 'delivered' && t.status !== 'cancelled' && <button onClick={() => act(t, 'cancel')} className={`${btnGhost} ml-1`}>Anular</button>}
                </td>
              </tr>
            );
          })}
        </TableShell>
      )}
    </div>
  );
}
