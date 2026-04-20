import { useAging, useAgingSummary } from '../hooks/useApi';
import Badge, { statusVariant, statusLabel } from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Aging() {
  const { data: lots, isLoading: lotsLoading } = useAging();
  const { data: summary, isLoading: summaryLoading } = useAgingSummary();

  if (lotsLoading || summaryLoading) return <LoadingSpinner />;

  const fmtCurrency = (v: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy', { locale: es }); } catch { return d; } };

  const buckets = summary?.buckets || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Aging Report</h1>
        <p className="text-sm text-text-muted mt-1">Antigüedad de inventario por lote — Identificación de stock inmovilizado</p>
      </div>

      {/* Bucket Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(buckets).map(([bucket, data]: any) => (
          <div key={bucket} className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-center">
            <p className="text-xs text-text-muted mb-1">{bucket} días</p>
            <p className="text-lg font-bold text-text-primary">{data.count}</p>
            <p className="text-xs text-brand-green">{fmtCurrency(data.totalValue)}</p>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 flex items-center justify-between">
        <span className="text-sm text-text-muted">Valor Total Inmovilizado</span>
        <span className="text-2xl font-bold text-brand-amber">{fmtCurrency(summary?.totalValue || 0)}</span>
      </div>

      {/* Lot Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                {['Riesgo', 'SKU', 'Lote', 'Ingreso', 'Días', 'Qty', 'Valor', 'Ubicación', 'Bucket'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(lots || []).map((lot: any, i: number) => (
                <tr key={i} className="border-b border-border-secondary hover:bg-bg-tertiary/50 transition-colors">
                  <td className="px-4 py-3"><Badge label={statusLabel(lot.risk)} variant={statusVariant(lot.risk)} /></td>
                  <td className="px-4 py-3 font-mono text-brand-blue text-xs">{lot.sku}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{lot.lot}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{fmt(lot.entryDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${lot.days > 120 ? 'text-brand-red' : lot.days > 90 ? 'text-brand-amber' : 'text-text-primary'}`}>
                      {lot.days}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-primary">{lot.qty}</td>
                  <td className="px-4 py-3 text-brand-green text-xs">{fmtCurrency(lot.value)}</td>
                  <td className="px-4 py-3 text-text-muted text-xs">{lot.location}</td>
                  <td className="px-4 py-3 text-text-muted text-xs">{lot.bucket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
