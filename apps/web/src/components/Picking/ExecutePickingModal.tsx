import { useState } from 'react';
import { useProcessFIFO, useCancelOrder } from '../../hooks/useApi';
import toast from 'react-hot-toast';
import { confirmDialog } from '../../lib/confirm';
import { getErrorMessage } from '../../lib/errors';

export default function ExecutePickingModal({ order, onClose }: { order: any; onClose: () => void }) {
  // Seeded once from the order, then edited by the operator. The parent
  // remounts this modal per order (key={order._id}), so no effect is needed to
  // resync — and calling setState synchronously in one caused a cascading render.
  const [items, setItems] = useState<{ sku: string; qty: number }[]>(() =>
    order.items.map((i: any) => ({
      sku: i.sku,
      qty: Math.max(0, i.requestedQty - i.pickedQty),
    })),
  );
  const processFifo = useProcessFIFO();
  const cancelOrder = useCancelOrder();
  const [errorObj, setErrorObj] = useState<string | null>(null);

  const updateQty = (index: number, val: number) => {
    const nw = [...items];
    nw[index].qty = Math.max(0, val);
    setItems(nw);
  };

  const handleConfirm = async () => {
    setErrorObj(null);
    try {
      await processFifo.mutateAsync({ id: order._id, items });
      onClose();
    } catch (e) {
      setErrorObj(getErrorMessage(e));
    }
  };

  const handleCancel = async () => {
    const ok = await confirmDialog({
      title: 'Anular este picking',
      detail: 'Perderas el estado actual y se liberan los lotes reservados.',
      confirmLabel: 'Anular',
      danger: true,
    });
    if (ok) {
      try {
        await cancelOrder.mutateAsync(order._id);
        onClose();
      } catch (e) {
        toast.error('No se pudo anular: ' + getErrorMessage(e));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary w-full max-w-4xl rounded-2xl border border-border-primary shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between p-5 border-b border-border-primary bg-bg-tertiary/50">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Planilla de Picking: {order.orderId}</h2>
            <p className="text-sm text-text-muted mt-1">{order.client} — {order.originType}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>

        {errorObj && (
          <div className="p-4 mx-5 mt-5 bg-brand-red/10 border border-brand-red/30 rounded-lg">
            <p className="text-sm text-brand-red font-medium">Error Crítico al confirmar:</p>
            <p className="text-xs text-brand-red/80 mt-1">{errorObj}</p>
          </div>
        )}

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
          <p className="text-sm font-medium text-brand-blue mb-4">Merca Pre-Asignada a Extraer (FIFO):</p>
          <div className="space-y-6">
            {order.items.map((item: any, i: number) => {
              const pendingQty = Math.max(0, item.requestedQty - item.pickedQty);
              return (
                <div key={item.sku} className="border border-border-secondary rounded-xl overflow-hidden bg-bg-tertiary">
                  <div className="p-3 bg-bg-primary/30 flex justify-between items-center border-b border-border-secondary">
                    <div>
                      <p className="text-sm font-bold text-text-primary">{item.sku} — {item.name}</p>
                      <p className="text-xs text-brand-orange mt-0.5">Avance: {item.pickedQty} de {item.requestedQty} Unds.</p>
                    </div>
                    {pendingQty > 0 ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-text-muted">A pickear HOY:</label>
                        <input 
                          type="number" 
                          value={items[i]?.qty ?? 0}
                          onChange={(e) => updateQty(i, Number(e.target.value))}
                          max={pendingQty}
                          min={0}
                          className="w-20 bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-bold text-white text-center focus:border-brand-blue"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-brand-green bg-brand-green/10 px-2 py-1 rounded">Completado</span>
                    )}
                  </div>
                  
                  {item.lots?.length > 0 && pendingQty > 0 && (
                    <div className="p-3">
                      <table className="w-full text-left text-xs">
                        <thead className="text-text-muted border-b border-border-primary">
                          <tr>
                            <th className="pb-2 font-medium">Ubicación Física</th>
                            <th className="pb-2 font-medium">Lote / Caja</th>
                            <th className="pb-2 font-medium">Pallet</th>
                            <th className="pb-2 text-right font-medium">Unds. a Extraer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-primary/50">
                          {item.lots.map((l: any, idx: number) => (
                            <tr key={idx}>
                              <td className="py-2 text-text-secondary">Rack {l.rack || '-'}, Col {l.col || '-'}, Fila {l.row || '-'}</td>
                              <td className="py-2 text-brand-blue font-mono">{l.lot}</td>
                              <td className="py-2 text-text-secondary">{l.pallet || 'S/N'}</td>
                              <td className="py-2 text-right font-bold text-text-primary">{l.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-5 border-t border-border-primary bg-bg-tertiary/50 flex gap-4 justify-between items-center">
          <button
            onClick={handleCancel}
            disabled={processFifo.isPending}
            className="px-4 py-2 bg-brand-red/10 text-brand-red text-sm font-medium rounded-lg hover:bg-brand-red/20 transition-all border border-brand-red/20"
          >
            Anular Picking
          </button>

          <button
            onClick={handleConfirm}
            disabled={processFifo.isPending || items.every(i => i.qty === 0)}
            className="flex-1 max-w-xs py-2 bg-brand-green text-black font-bold rounded-lg hover:shadow-lg hover:shadow-brand-green/20 transition-all disabled:opacity-50 text-sm"
          >
            {processFifo.isPending ? 'Procesando...' : 'Confirmar (Picking Realizado)'}
          </button>
        </div>
      </div>
    </div>
  );
}
