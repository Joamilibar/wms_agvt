import { useState } from 'react';
import { useOrders, useStartOrder, useCancelOrder } from '../hooks/useApi';
import Badge, { statusVariant, statusLabel } from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import CreatePickingModal from '../components/Picking/CreatePickingModal';
import ExecutePickingModal from '../components/Picking/ExecutePickingModal';

const statusColumns: Record<string, string> = {
  pending: 'Pendientes',
  in_progress: 'En Proceso',
  completed: 'Completadas',
  cancelled: 'Canceladas',
};

export default function Picking() {
  const { data, isLoading } = useOrders({ limit: 50 });
  const startMutation = useStartOrder();
  const cancelMutation = useCancelOrder();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeOrderToExecute, setActiveOrderToExecute] = useState<any>(null);

  if (isLoading) return <LoadingSpinner />;

  const orders = data?.data || [];
  const grouped: Record<string, any[]> = { pending: [], in_progress: [], completed: [], cancelled: [] };
  orders.forEach((o: any) => { (grouped[o.status] || []).push(o); });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Picking</h1>
          <p className="text-sm text-text-muted mt-1">Gestión de órdenes, Planillas y Guías a BSale</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-brand-blue text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-brand-blue/90 transition-all border shadow-lg shadow-brand-blue/20"
        >
          + Nueva Orden
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Object.entries(statusColumns).map(([status, title]) => (
          <div key={status} className="bg-bg-secondary border border-border-primary rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">{grouped[status]?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {grouped[status]?.map((order: any) => (
                <div key={order._id} className="bg-bg-tertiary border border-border-secondary rounded-lg p-3 transition-all hover:border-brand-blue/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-brand-blue">{order.orderId}</span>
                    <Badge label={statusLabel(order.status)} variant={statusVariant(order.status)} />
                  </div>
                  <p className="text-sm text-text-primary font-medium mb-1">{order.client}</p>
                  <p className="text-xs text-text-muted">{order.items?.length} productos · {order.warehouse}</p>

                  {order.items?.map((item: any, i: number) => (
                    <div key={i} className="mt-2 flex items-center justify-between bg-bg-primary/50 rounded px-2 py-1">
                      <span className="text-xs text-text-secondary">{item.sku}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-text-secondary">{item.pickedQty}/{item.requestedQty}</span>
                        {item.status !== 'pending' && <Badge label={statusLabel(item.status)} variant={statusVariant(item.status)} />}
                      </div>
                    </div>
                  ))}

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    {order.status === 'pending' && (
                      <>
                        <button
                          onClick={() => startMutation.mutate(order._id)}
                          disabled={startMutation.isPending}
                          className="flex-1 py-1.5 bg-brand-blue/15 text-brand-blue text-xs font-medium rounded-md hover:bg-brand-blue/25 transition-colors"
                        >
                          Iniciar
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('¿Seguro que deseas anular este picking?')) {
                              cancelMutation.mutate(order._id);
                            }
                          }}
                          disabled={cancelMutation.isPending}
                          className="px-3 py-1.5 bg-brand-red/10 text-brand-red text-xs font-medium rounded-md hover:bg-brand-red/20 transition-colors border border-brand-red/20"
                          title="Anular Picking"
                        >
                          Anular
                        </button>
                      </>
                    )}
                    {order.status === 'in_progress' && (
                      <button
                        onClick={() => setActiveOrderToExecute(order)}
                        className="flex-1 py-1.5 bg-brand-green/15 text-brand-green text-xs font-medium rounded-md hover:bg-brand-green/25 transition-colors border border-brand-green/20"
                      >
                        Ver Planilla / Ejecutar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {(!grouped[status] || grouped[status].length === 0) && (
                <p className="text-xs text-text-muted text-center py-4">Sin órdenes</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && <CreatePickingModal onClose={() => setShowCreateModal(false)} />}
      {activeOrderToExecute && <ExecutePickingModal order={activeOrderToExecute} onClose={() => setActiveOrderToExecute(null)} />}
    </div>
  );
}
