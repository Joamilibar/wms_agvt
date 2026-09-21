import { useState } from 'react';
import { usePlanningAlerts, useOperationalAlerts } from '../hooks/useApi';
import BoardTab from '../components/Planning/BoardTab';
import ProposalTab from '../components/Planning/ProposalTab';
import StoreTab from '../components/Planning/StoreTab';
import ProductionTab from '../components/Planning/ProductionTab';
import RecipesTab from '../components/Planning/RecipesTab';
import HistoryTab from '../components/Planning/HistoryTab';
import DocumentsTab from '../components/Planning/DocumentsTab';
import ItemsTab from '../components/Planning/ItemsTab';
import MastersTab from '../components/Planning/MastersTab';
import PurchaseOrdersTab from '../components/Planning/PurchaseOrdersTab';
import ProjectsTab from '../components/Planning/ProjectsTab';
import TrackingTab from '../components/Planning/TrackingTab';
import ParamsTab from '../components/Planning/ParamsTab';

const TABS = [
  { key: 'board', label: 'Tablero' },
  { key: 'proposal', label: 'Pedido' },
  { key: 'store', label: 'Tienda' },
  { key: 'production', label: 'Producción' },
  { key: 'recipes', label: 'Recetas' },
  { key: 'projects', label: 'Proyectos' },
  { key: 'tracking', label: 'Seguimiento' },
  { key: 'history', label: 'Historial' },
  { key: 'documents', label: 'Documentos' },
  { key: 'items', label: 'Abastecimiento' },
  { key: 'masters', label: 'Bodegas y proveedores' },
  { key: 'orders', label: 'Órdenes de compra' },
  { key: 'params', label: 'Parámetros' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * The planning screen: the board and the purchase proposal (phase 1) over
 * the history and the masters they read (phase 0); store, production,
 * projects, tracking and parameters came with phases 2–4.
 */
export default function Planificacion() {
  const [tab, setTab] = useState<TabKey>('board');
  const { data: alerts } = usePlanningAlerts();
  const { data: opAlerts } = useOperationalAlerts();
  const pending = (alerts?.importedWithoutSupplier ?? 0) + (alerts?.unknownOrigin ?? 0);
  const critical = (opAlerts ?? []).filter((a) => a.severity === 'critical').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Planificación</h1>
        <p className="text-sm text-text-muted mt-1">Semáforo por SKU, pedido por proveedor, reposición a tienda, producción con recetas, proyectos, seguimiento del pronóstico y parámetros del motor</p>
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
            {t.key === 'tracking' && critical > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-brand-red/20 text-brand-red text-[11px] font-semibold">{critical}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'board' && <BoardTab />}
      {tab === 'proposal' && <ProposalTab />}
      {tab === 'store' && <StoreTab />}
      {tab === 'production' && <ProductionTab />}
      {tab === 'recipes' && <RecipesTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'masters' && <MastersTab />}
      {tab === 'orders' && <PurchaseOrdersTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'tracking' && <TrackingTab />}
      {tab === 'params' && <ParamsTab />}
    </div>
  );
}
