import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineRefresh } from 'react-icons/hi';
import {
  usePacks,
  usePackAvailability,
  useImportPacksFromBsale,
  type PackAvailability,
  type PackComponentAvailability,
  type PackImportResult,
} from '../hooks/useApi';
import { useAuthStore } from '../stores/auth.store';
import { getErrorMessage } from '../lib/errors';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';

/**
 * Pack stock is never stored: it is the minimum over components of
 * floor(available / qtyPerPack), per warehouse. The table shows that number
 * and, expanded, the components behind it with the one that caps it marked —
 * that is the one to replenish.
 */
export default function Packs() {
  const can = useAuthStore((s) => s.can);
  const [warehouse, setWarehouse] = useState<string>('');
  const [search, setSearch] = useState('');
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<PackImportResult | null>(null);

  const { data: recipes } = usePacks();
  // Always fetch every warehouse: the filter is local so the KPIs stay global.
  const { data: availability, isLoading } = usePackAvailability();
  const importMutation = useImportPacksFromBsale();

  const warehouses = useMemo(
    () => [...new Set((availability ?? []).map((a) => a.warehouse))].sort(),
    [availability],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (availability ?? [])
      .filter((a) => !warehouse || a.warehouse === warehouse)
      .filter((a) => !onlyWithStock || a.packsPhysical > 0)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.packSku.includes(q))
      .sort((a, b) => b.packsAvailable - a.packsAvailable || a.name.localeCompare(b.name));
  }, [availability, warehouse, onlyWithStock, search]);

  const withStock = (availability ?? []).filter((a) => a.packsAvailable > 0);
  const packsSellable = new Set(withStock.map((a) => a.packSku)).size;
  const unitsSellable = withStock.reduce((s, a) => s + a.packsAvailable, 0);

  const handleImport = async () => {
    try {
      const result = await importMutation.mutateAsync();
      setLastImport(result);
      toast.success(
        `${result.found} packs en BSale: ${result.created} nuevos, ${result.updated} actualizados, ${result.unchanged} sin cambios`,
      );
    } catch (e) {
      toast.error('No se pudo importar desde BSale: ' + getErrorMessage(e));
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Packs</h1>
          <p className="text-sm text-text-muted mt-1">
            Stock calculado desde los componentes: el que menos alcanza es el que topa
          </p>
        </div>
        {can('admin') && (
          <button
            onClick={handleImport}
            disabled={importMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white text-sm font-medium rounded-lg hover:bg-brand-blue/80 transition-colors disabled:opacity-50"
          >
            <HiOutlineRefresh className={`w-4 h-4 ${importMutation.isPending ? 'animate-spin' : ''}`} />
            {importMutation.isPending ? 'Importando...' : 'Importar recetas desde BSale'}
          </button>
        )}
      </div>

      {lastImport && (lastImport.warnings.length > 0 || lastImport.skipped.length > 0) && (
        <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-xl p-4 text-sm space-y-2">
          <p className="font-medium text-brand-amber">
            El import terminó con avisos — son datos a corregir en BSale:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-text-secondary text-xs">
            {lastImport.warnings.map((w) => <li key={w}>{w}</li>)}
            {lastImport.skipped.map((s) => <li key={s}>Omitido: {s}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Recetas activas" value={recipes?.length ?? 0} subtitle="Importadas de BSale o cargadas a mano" color="blue" />
        <KpiCard title="Packs con stock" value={packsSellable} subtitle="En al menos una bodega" color="green" />
        <KpiCard title="Unidades armables" value={unitsSellable} subtitle="Sumando todas las bodegas, sobre disponible" color="purple" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar pack por nombre o SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue"
        />
        <select
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value)}
          className="px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue"
        >
          <option value="">Todas las bodegas</option>
          {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={onlyWithStock}
            onChange={(e) => setOnlyWithStock(e.target.checked)}
            className="accent-brand-blue"
          />
          Solo con stock
        </label>
        <span className="text-xs text-text-muted ml-auto">{rows.length} filas</span>
      </div>

      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                <th className="w-8" />
                {['Pack', 'SKU', 'Bodega', 'Disponibles', 'Físicos', 'Topado por'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-text-muted text-sm">
                    {availability?.length
                      ? 'Ningún pack coincide con el filtro'
                      : 'No hay recetas. Importa desde BSale para empezar.'}
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const key = `${row.packSku}|${row.warehouse}`;
                const isOpen = expanded === key;
                return (
                  <PackRow
                    key={key}
                    row={row}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PackRow({ row, isOpen, onToggle }: { row: PackAvailability; isOpen: boolean; onToggle: () => void }) {
  const availVariant = row.packsAvailable > 0 ? 'green' : row.packsPhysical > 0 ? 'amber' : 'red';
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border-secondary hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
      >
        <td className="pl-3 text-text-muted">
          {isOpen ? <HiOutlineChevronDown className="w-4 h-4" /> : <HiOutlineChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 text-text-primary">{row.name.trim()}</td>
        <td className="px-4 py-3 font-mono text-brand-blue text-xs">{row.packSku}</td>
        <td className="px-4 py-3"><Badge label={row.warehouse} variant="blue" /></td>
        <td className="px-4 py-3"><Badge label={String(row.packsAvailable)} variant={availVariant} /></td>
        <td className="px-4 py-3 text-text-secondary">{row.packsPhysical}</td>
        <td className="px-4 py-3 text-xs text-text-secondary">
          {row.limitedBy ? (
            <span title={row.limitedBy.sku}>
              {row.limitedBy.name}
              <span className="text-text-muted"> · {row.limitedBy.available} disp ÷ {row.limitedBy.qtyPerPack}</span>
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-border-secondary bg-bg-tertiary/30">
          <td />
          <td colSpan={6} className="px-4 py-3">
            <ComponentsTable components={row.components} limitedBy={row.limitedBy} />
          </td>
        </tr>
      )}
    </>
  );
}

function ComponentsTable({
  components,
  limitedBy,
}: {
  components: PackComponentAvailability[];
  limitedBy: PackComponentAvailability | null;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-text-muted uppercase tracking-wider">
          {['Componente', 'SKU', 'Por pack', 'Físico', 'Reservado', 'Disponible', 'Packs que cubre'].map((h) => (
            <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {components.map((c) => {
          const caps = limitedBy?.sku === c.sku;
          return (
            <tr key={c.sku} className={caps ? 'text-brand-amber' : 'text-text-secondary'}>
              <td className="px-3 py-1.5">
                {c.name}
                {caps && <span className="ml-2 text-[10px] uppercase font-semibold">← topa</span>}
              </td>
              <td className="px-3 py-1.5 font-mono">{c.sku}</td>
              <td className="px-3 py-1.5">×{c.qtyPerPack}</td>
              <td className="px-3 py-1.5">{c.physical}</td>
              <td className="px-3 py-1.5">{c.reserved}</td>
              <td className="px-3 py-1.5 font-semibold">{c.available}</td>
              <td className="px-3 py-1.5">{c.packsFromThis}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
