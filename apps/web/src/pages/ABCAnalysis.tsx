import { useABC } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Badge from '../components/ui/Badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const classColors: Record<string, string> = { A: '#4ade80', B: '#1a7fe8', C: '#e8a20f' };

export default function ABCAnalysis() {
  const { data, isLoading } = useABC();

  if (isLoading) return <LoadingSpinner />;

  const items = data || [];
  const fmtCurrency = (v: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);

  const chartData = items.slice(0, 15).map((i: any) => ({
    sku: i._id,
    ventas: Math.round(i.totalValue / 1000),
    class: i.class,
  }));

  const classSummary = items.reduce((acc: Record<string, { count: number; value: number }>, i: any) => {
    if (!acc[i.class]) acc[i.class] = { count: 0, value: 0 };
    acc[i.class].count++;
    acc[i.class].value += i.totalValue;
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Análisis ABC</h1>
        <p className="text-sm text-text-muted mt-1">Clasificación Pareto (80-15-5) por valor de ventas — Últimos 90 días</p>
      </div>

      {/* Class Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {['A', 'B', 'C'].map((cls) => (
          <div key={cls} className="bg-bg-secondary border border-border-primary rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold" style={{ color: classColors[cls] }}>Clase {cls}</span>
              <span className="text-lg font-bold text-text-primary">{classSummary[cls]?.count || 0} SKUs</span>
            </div>
            <p className="text-sm text-text-secondary">Valor: {fmtCurrency(classSummary[cls]?.value || 0)}</p>
            <p className="text-xs text-text-muted mt-1">
              {cls === 'A' ? '~80% del valor total' : cls === 'B' ? '~15% del valor total' : '~5% del valor total'}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Top 15 SKUs por Valor de Ventas</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} layout="vertical">
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis dataKey="sku" type="category" width={80} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#161b27', border: '1px solid #2a3142', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
              formatter={(v: any) => [`$${v}K`, 'Ventas (CLP)']}
            />
            <Bar dataKey="ventas" radius={[0, 4, 4, 0]}>
              {chartData.map((item: any, i: number) => (
                <Cell key={i} fill={classColors[item.class] || '#64748b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                {['Clase', 'SKU', 'Ventas (Qty)', 'Ventas (CLP)', '% Acumulado', 'Stock Actual', 'Valor Stock'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => (
                <tr key={i} className="border-b border-border-secondary hover:bg-bg-tertiary/50 transition-colors">
                  <td className="px-4 py-3">
                    <Badge label={item.class} variant={item.class === 'A' ? 'green' : item.class === 'B' ? 'blue' : 'amber'} />
                  </td>
                  <td className="px-4 py-3 font-mono text-brand-blue text-xs">{item._id}</td>
                  <td className="px-4 py-3 text-text-primary">{item.totalQty}</td>
                  <td className="px-4 py-3 text-brand-green text-xs">{fmtCurrency(item.totalValue)}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{item.cumulativePercent?.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-text-primary">{item.currentStock}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{fmtCurrency(item.currentValue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
