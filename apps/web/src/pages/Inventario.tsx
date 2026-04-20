import { useState } from 'react';
import { useStock, useCreateStockLot } from '../hooks/useApi';
import Badge, { statusLabel } from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Inventario() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useStock({ page, limit: 15, sku: search || undefined });
  const createMutation = useCreateStockLot();

  const [form, setForm] = useState({ sku: '', name: '', lot: '', entryDate: '', qty: 0, unitCost: 0, location: '', warehouse: 'Central', supplier: '' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync(form as any);
    setShowCreate(false);
    setForm({ sku: '', name: '', lot: '', entryDate: '', qty: 0, unitCost: 0, location: '', warehouse: 'Central', supplier: '' });
  };

  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy', { locale: es }); } catch { return d; } };
  const fmtCurrency = (v: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inventario FIFO</h1>
          <p className="text-sm text-text-muted mt-1">Lotes activos ordenados por fecha de ingreso</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-brand-blue text-white text-sm font-medium rounded-lg hover:bg-brand-blue/80 transition-colors">
          + Nuevo Lote
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-bg-secondary border border-border-primary rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'SKU', key: 'sku', type: 'text' },
            { label: 'Nombre', key: 'name', type: 'text' },
            { label: 'Lote', key: 'lot', type: 'text' },
            { label: 'Fecha Ingreso', key: 'entryDate', type: 'date' },
            { label: 'Cantidad', key: 'qty', type: 'number' },
            { label: 'Costo Unit.', key: 'unitCost', type: 'number' },
            { label: 'Ubicación', key: 'location', type: 'text' },
            { label: 'Proveedor', key: 'supplier', type: 'text' },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-text-muted mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue"
                required={['sku', 'name', 'lot', 'entryDate', 'qty', 'unitCost'].includes(f.key)}
              />
            </div>
          ))}
          <div className="flex items-end">
            <button type="submit" disabled={createMutation.isPending} className="w-full py-2 bg-brand-green text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {createMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar por SKU..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full max-w-xs px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue"
      />

      {/* Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                {['SKU', 'Nombre', 'Lote', 'Fecha Ingreso', 'Qty', 'Costo Unit.', 'Valor', 'Ubicación', 'Bodega'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.data?.map((lot: any) => (
                <tr key={lot._id} className="border-b border-border-secondary hover:bg-bg-tertiary/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-brand-blue text-xs">{lot.sku}</td>
                  <td className="px-4 py-3 text-text-primary">{lot.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{lot.lot}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{fmt(lot.entryDate)}</td>
                  <td className="px-4 py-3 font-semibold text-text-primary">{lot.qty}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{fmtCurrency(lot.unitCost)}</td>
                  <td className="px-4 py-3 text-brand-green text-xs font-medium">{fmtCurrency(lot.qty * lot.unitCost)}</td>
                  <td className="px-4 py-3 text-text-muted text-xs">{lot.location}</td>
                  <td className="px-4 py-3"><Badge label={lot.warehouse} variant="blue" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-xs text-text-secondary disabled:opacity-40">Anterior</button>
          <span className="text-xs text-text-muted">Página {page} de {data.totalPages}</span>
          <button onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page === data.totalPages} className="px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-xs text-text-secondary disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  );
}
