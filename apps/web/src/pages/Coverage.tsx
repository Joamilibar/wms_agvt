import { useCoverage } from '../hooks/useApi';
import Badge, { statusVariant, statusLabel } from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import KpiCard from '../components/ui/KpiCard';
import { HiOutlineExclamation, HiOutlineCheck, HiOutlineClock } from 'react-icons/hi';

export default function Coverage() {
  const { data, isLoading } = useCoverage();

  if (isLoading) return <LoadingSpinner />;

  const items = data || [];
  const critico = items.filter((i: any) => i.status === 'critico');
  const normal = items.filter((i: any) => i.status === 'normal');
  const sinMov = items.filter((i: any) => i.status === 'sin_movimiento');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Cobertura de Inventario</h1>
        <p className="text-sm text-text-muted mt-1">Días de cobertura = Stock Actual / Promedio Diario de Ventas (90 días)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Críticos" value={critico.length} subtitle="≤7 días de cobertura" color="red" icon={<HiOutlineExclamation className="w-6 h-6" />} />
        <KpiCard title="Normales" value={normal.length} subtitle="8-90 días de cobertura" color="green" icon={<HiOutlineCheck className="w-6 h-6" />} />
        <KpiCard title="Sin Movimiento" value={sinMov.length} subtitle="Sin ventas en 90 días" color="gray" icon={<HiOutlineClock className="w-6 h-6" />} />
      </div>

      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                {['Estado', 'SKU', 'Nombre', 'Stock Actual', 'Prom. Diario', 'Días Cobertura'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => (
                <tr key={i} className="border-b border-border-secondary hover:bg-bg-tertiary/50 transition-colors">
                  <td className="px-4 py-3"><Badge label={statusLabel(item.status)} variant={statusVariant(item.status)} /></td>
                  <td className="px-4 py-3 font-mono text-brand-blue text-xs">{item.sku}</td>
                  <td className="px-4 py-3 text-text-primary">{item.name}</td>
                  <td className="px-4 py-3 font-semibold text-text-primary">{item.currentStock}</td>
                  <td className="px-4 py-3 text-text-secondary">{item.dailyRate}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${item.coverageDays === -1 ? 'text-text-muted' : item.coverageDays <= 7 ? 'text-brand-red' : item.coverageDays <= 30 ? 'text-brand-amber' : 'text-brand-green'}`}>
                      {item.coverageDays === -1 ? '∞' : `${item.coverageDays}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
