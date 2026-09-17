import { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { usePurchaseOrders, useSetPoEta, type PurchaseOrder } from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, fmtInt } from './ui-helpers';

const STATUS_LABEL: Record<PurchaseOrder['status'], string> = {
  draft: 'Borrador', approved: 'Aprobada', sent: 'Enviada', partial: 'Recepción parcial', received: 'Recibida', cancelled: 'Anulada',
};

/**
 * Open orders are the only "in transit" the engine sees. Phase 0 keeps this
 * to the initial load and the ETA per line (D13); approval and receipt
 * arrive with phase 1.
 */
export default function PurchaseOrdersTab() {
  const can = useAuthStore((s) => s.can);
  const { data: orders, isLoading } = usePurchaseOrders();
  const setEta = useSetPoEta();
  const [open, setOpen] = useState<string | null>(null);

  const saveEta = async (po: PurchaseOrder, sku: string, eta: string) => {
    try {
      await setEta.mutateAsync({ id: po._id, sku, eta: eta || null });
    } catch (e) {
      toast.error('No se pudo guardar la ETA: ' + getErrorMessage(e));
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Lo pendiente de recibir de estas órdenes cuenta como tránsito. Una línea sin fecha estimada cuenta igual, pero queda marcada.</p>
      <TableShell headers={['Orden', 'Proveedor', 'Estado', 'Líneas', 'Unidades', 'Sin ETA', 'Origen', 'Creada']}>
        {orders?.length === 0 && <Empty colSpan={8} text="No hay órdenes de compra" />}
        {orders?.map((po) => {
          const units = po.lines.reduce((s, l) => s + l.qtyOrdered - l.qtyReceived, 0);
          const noEta = po.lines.filter((l) => !l.eta && l.qtyOrdered > l.qtyReceived).length;
          const isOpen = open === po._id;
          return [
            <tr key={po._id} onClick={() => setOpen(isOpen ? null : po._id)} className="border-b border-border-secondary hover:bg-bg-tertiary/50 cursor-pointer">
              <td className="px-3 py-2 font-mono text-xs text-brand-blue">{po.number}</td>
              <td className="px-3 py-2 text-text-primary">{po.supplierName || <span className="text-text-muted">sin proveedor</span>}</td>
              <td className="px-3 py-2"><Badge label={STATUS_LABEL[po.status]} variant={po.status === 'cancelled' ? 'gray' : po.status === 'received' ? 'green' : 'blue'} /></td>
              <td className="px-3 py-2 text-text-secondary">{po.lines.length}</td>
              <td className="px-3 py-2 font-semibold text-text-primary">{fmtInt(units)}</td>
              <td className="px-3 py-2">{noEta > 0 ? <Badge label={`${noEta} líneas`} variant="amber" /> : <span className="text-text-muted text-xs">—</span>}</td>
              <td className="px-3 py-2 text-xs text-text-muted">{po.source === 'initial_transit' ? 'carga inicial' : po.source}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{format(new Date(po.createdAt), 'dd-MM-yyyy')}</td>
            </tr>,
            isOpen && (
              <tr key={`${po._id}-lines`} className="border-b border-border-secondary bg-bg-tertiary/30">
                <td colSpan={8} className="px-4 py-3">
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
                            {can('admin', 'supervisor') ? (
                              <input
                                type="date"
                                defaultValue={l.eta ? l.eta.slice(0, 10) : ''}
                                onBlur={(e) => { if ((e.target.value || null) !== (l.eta ? l.eta.slice(0, 10) : null)) saveEta(po, l.sku, e.target.value); }}
                                className={`${inputCls} ${l.eta ? '' : 'border-brand-amber/60'}`}
                              />
                            ) : (l.eta ? format(new Date(l.eta), 'dd-MM-yyyy') : <span className="text-brand-amber">sin ETA</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {po.notes && <p className="text-[11px] text-text-muted mt-2">{po.notes}</p>}
                </td>
              </tr>
            ),
          ];
        })}
      </TableShell>
    </div>
  );
}
