import { useState } from 'react';
import { usePlanningAlerts } from '../hooks/useApi';
import HistoryTab from '../components/Planning/HistoryTab';
import DocumentsTab from '../components/Planning/DocumentsTab';
import ItemsTab from '../components/Planning/ItemsTab';
import MastersTab from '../components/Planning/MastersTab';
import PurchaseOrdersTab from '../components/Planning/PurchaseOrdersTab';

const TABS = [
  { key: 'history', label: 'Historial' },
  { key: 'documents', label: 'Documentos' },
  { key: 'items', label: 'Abastecimiento' },
  { key: 'masters', label: 'Bodegas y proveedores' },
  { key: 'orders', label: 'Órdenes de compra' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * Phase 0 of the planning module: the history the engine will read and the
 * masters it needs. The forecast, the semaphore and the purchase proposal
 * come with phase 1 and will sit in this same screen.
 */
export default function Planificacion() {
  const [tab, setTab] = useState<TabKey>('history');
  const { data: alerts } = usePlanningAlerts();
  const pending = (alerts?.importedWithoutSupplier ?? 0) + (alerts?.unknownOrigin ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Planificación</h1>
        <p className="text-sm text-text-muted mt-1">Historial de ventas por canal, fichas de abastecimiento y tránsito: la base de compras, producción y reposición</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border-primary">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-brand-blue text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
          >
            {t.label}
            {t.key === 'items' && pending > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-brand-red/20 text-brand-red text-[11px] font-semibold">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'history' && <HistoryTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'masters' && <MastersTab />}
      {tab === 'orders' && <PurchaseOrdersTab />}
    </div>
  );
}
