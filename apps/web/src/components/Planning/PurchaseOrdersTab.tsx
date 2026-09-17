import { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { usePurchaseOrders, useSetPoEta, usePurchaseOrderAction, type PurchaseOrder } from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import { confirmDialog } from '../../lib/confirm';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, btnGhost, btnPrimary, fmtInt } from './ui-helpers';
import type { BadgeVariant } from '../../lib/status';

const STATUS_LABEL: Record<PurchaseOrder['status'], string> = {
  draft: 'Borrador', approved: 'Aprobada', sent: 'Enviada', partial: 'Recepción parcial', received: 'Recibida', cancelled: 'Anulada',
};
const STATUS_VARIANT: Record<PurchaseOrder['status'], BadgeVariant> = {
  draft: 'gray', approved: 'blue', sent: 'purple', partial: 'amber', received: 'green', cancelled: 'gray',
};

/**
 * The purchase-order cycle: draft → approved (admin) → sent → received.
 * What is approved and not received is the transit the engine sees.
 * Receiving creates the lots with the real date and the landed cost.
 */
export default function PurchaseOrdersTab() {
  const can = useAuthStore((s) => s.can);
  const { data: orders, isLoading } = usePurchaseOrders();
  const setEta = useSetPoEta();
  const action = usePurchaseOrderAction();
  const [open, setOpen] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  const saveEta = async (po: PurchaseOrder, sku: string, eta: string) => {
    try { await setEta.mutateAsync({ id: po._id, sku, eta: eta || null }); }
    catch (e) { toast.error('No se pudo guardar la ETA: ' + getErrorMessage(e)); }
  };
  const run = async (po: PurchaseOrder, act: 'approve' | 'send' | 'cancel', confirm?: { title: string; detail: string; danger?: boolean }) => {
    if (confirm && !(await confirmDialog({ ...confirm, confirmLabel: confirm.title }))) return;
    try {
      await action.mutateAsync({ id: po._id, action: act });
      toast.success(`${po.number}: ${act === 'approve' ? 'aprobada' : act === 'send' ? 'marcada enviada' : 'anulada'}`);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Lo pendiente de recibir de las órdenes aprobadas, enviadas o parciales cuenta como tránsito. Una línea sin ETA cuenta igual, pero queda marcada. Registrar la recepción también en BSale: el sync manda sobre la cantidad.</p>
      <TableShell headers={['Orden', 'Proveedor', 'Estado', 'Líneas', 'Pendiente', 'Sin ETA', 'Origen', 'Creada', '']}>
        {orders?.length === 0 && <Empty colSpan={9} text="No hay órdenes de compra" />}
        {orders?.map((po) => {
          const pending = po.lines.reduce((s, l) => s + l.qtyOrdered - l.qtyReceived, 0);
          const noEta = po.lines.filter((l) => !l.eta && l.qtyOrdered > l.qtyReceived).length;
          const isOpen = open === po._id;
          const isOpenStatus = ['approved', 'sent', 'partial'].includes(po.status);
          return [
            <tr key={po._id} onClick={() => setOpen(isOpen ? null : po._id)} className="border-b border-border-secondary hover:bg-bg-tertiary/50 cursor-pointer">
              <td className="px-3 py-2 font-mono text-xs text-brand-blue">{po.number}</td>
              <td className="px-3 py-2 text-text-primary">{po.supplierName || <span className="text-text-muted">sin proveedor</span>}</td>
              <td className="px-3 py-2"><Badge label={STATUS_LABEL[po.status]} variant={STATUS_VARIANT[po.status]} /></td>
              <td className="px-3 py-2 text-text-secondary">{po.lines.length}</td>
              <td className="px-3 py-2 font-semibold text-text-primary">{fmtInt(pending)}</td>
              <td className="px-3 py-2">{isOpenStatus && noEta > 0 ? <Badge label={`${noEta} líneas`} variant="amber" /> : <span className="text-text-muted text-xs">—</span>}</td>
              <td className="px-3 py-2 text-xs text-text-muted">{po.source === 'initial_transit' ? 'carga inicial' : po.source === 'planning_run' ? 'corrida' : po.source}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{format(new Date(po.createdAt), 'dd-MM-yyyy')}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                {po.status === 'draft' && can('admin') && <button onClick={() => run(po, 'approve')} className={btnPrimary}>Aprobar</button>}
                {po.status === 'approved' && can('admin', 'supervisor') && <button onClick={() => run(po, 'send')} className={`${btnGhost} ml-1`}>Enviada</button>}
                {isOpenStatus && can('admin', 'supervisor') && <button onClick={() => setReceiving(po)} className={`${btnGhost} ml-1`}>Recibir</button>}
                {po.status !== 'received' && po.status !== 'cancelled' && can('admin') && (
                  <button onClick={() => run(po, 'cancel', { title: 'Anular', detail: `${po.number} dejará de contar como tránsito.`, danger: true })} className={`${btnGhost} ml-1`}>Anular</button>
                )}
              </td>
            </tr>,
            isOpen && (
              <tr key={`${po._id}-lines`} className="border-b border-border-secondary bg-bg-tertiary/30">
                <td colSpan={9} className="px-4 py-3">
                  <table className="w-full text-xs">
                    <thead><tr className="text-text-muted uppercase tracking-wider"><th className="px-2 py-1 text-left">SKU</th><th className="px-2 py-1 text-left">Producto</th><th className="px-2 py-1 text-left">Pedido</th><th className="px-2 py-1 text-left">Recibido</th><th className="px-2 py-1 text-left">Costo</th><th className="px-2 py-1 text-left">ETA</th></tr></thead>
                    <tbody>
                      {po.lines.map((l) => (
                        <tr key={l.sku} className="text-text-secondary">
                          <td className="px-2 py-1 font-mono">{l.sku}</td>
                          <td className="px-2 py-1">{l.name}</td>
                          <td className="px-2 py-1 font-semibold text-text-primary">{fmtInt(l.qtyOrdered)}</td>
                          <td className="px-2 py-1">{fmtInt(l.qtyReceived)}</td>
                          <td className="px-2 py-1">{l.unitCost != null ? `${po.currency} ${l.unitCost}` : '—'}</td>
                          <td className="px-2 py-1">
                            {can('admin', 'supervisor') && po.status !== 'received' && po.status !== 'cancelled' ? (
                              <input type="date" defaultValue={l.eta ? l.eta.slice(0, 10) : ''}
                                onBlur={(e) => { if ((e.target.value || null) !== (l.eta ? l.eta.slice(0, 10) : null)) saveEta(po, l.sku, e.target.value); }}
                                className={`${inputCls} ${l.eta ? '' : 'border-brand-amber/60'}`} />
                            ) : (l.eta ? format(new Date(l.eta), 'dd-MM-yyyy') : <span className="text-brand-amber">sin ETA</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {po.notes && <pre className="text-[11px] text-text-muted mt-2 whitespace-pre-wrap font-sans">{po.notes}</pre>}
                </td>
              </tr>
            ),
          ];
        })}
      </TableShell>
      {receiving && <ReceiveForm po={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function ReceiveForm({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const action = usePurchaseOrderAction();
  const pendingLines = po.lines.filter((l) => l.qtyOrdered > l.qtyReceived);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(pendingLines.map((l) => [l.sku, l.qtyOrdered - l.qtyReceived])));
  const [fx, setFx] = useState<string>('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const needsFx = po.currency !== 'CLP';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = pendingLines.map((l) => ({ sku: l.sku, qty: qty[l.sku] ?? 0 })).filter((l) => l.qty > 0);
    if (lines.length === 0) { toast.error('Indica al menos una cantidad'); return; }
    if (needsFx && !fx) { toast.error(`Falta el tipo de cambio ${po.currency}/CLP`); return; }
    try {
      const res = await action.mutateAsync({ id: po._id, action: 'receive', body: { lines, fxRate: needsFx ? Number(fx) : undefined, receivedAt } }) as { lots: string[] };
      toast.success(`${po.number}: ${res.lots.length} lotes creados en ${po.destinationWarehouse}. Regístralo también en BSale.`, { duration: 6000 });
      onClose();
    } catch (err) {
      toast.error('No se pudo recibir: ' + getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="bg-bg-secondary border border-brand-blue/40 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Recibir {po.number} en {po.destinationWarehouse}</h3>
        <label className="text-xs text-text-muted">Fecha<input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={`${inputCls} block mt-1`} /></label>
        {needsFx && <label className="text-xs text-text-muted">Tipo de cambio {po.currency}/CLP<input type="number" min={0} step="0.01" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="ej. 950" className={`${inputCls} block mt-1 w-28`} required /></label>}
        <span className="flex-1" />
        <button type="submit" disabled={action.isPending} className={btnPrimary}>Confirmar recepción</button>
        <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-text-muted uppercase tracking-wider"><th className="px-2 py-1 text-left">SKU</th><th className="px-2 py-1 text-left">Producto</th><th className="px-2 py-1 text-left">Pendiente</th><th className="px-2 py-1 text-left">Recibido ahora</th></tr></thead>
        <tbody>
          {pendingLines.map((l) => (
            <tr key={l.sku} className="text-text-secondary">
              <td className="px-2 py-1 font-mono">{l.sku}</td>
              <td className="px-2 py-1">{l.name}</td>
              <td className="px-2 py-1">{fmtInt(l.qtyOrdered - l.qtyReceived)}</td>
              <td className="px-2 py-1"><input type="number" min={0} max={l.qtyOrdered - l.qtyReceived} value={qty[l.sku] ?? 0} onChange={(e) => setQty({ ...qty, [l.sku]: Number(e.target.value) })} className={`${inputCls} w-24`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-text-muted">El costo del lote = costo unitario × tipo de cambio × factor de desembarque del proveedor. Cada línea recibida crea un lote con fecha de hoy.</p>
    </form>
  );
}
