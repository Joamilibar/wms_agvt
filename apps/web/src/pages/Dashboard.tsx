import { useDashboardKPIs, useAgingSummary } from '../hooks/useApi';
import KpiCard from '../components/ui/KpiCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { HiOutlineCube, HiOutlineCurrencyDollar, HiOutlineExclamation, HiOutlineCollection, HiOutlineShieldCheck, HiOutlineTrendingUp } from 'react-icons/hi';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#4ade80', '#1a7fe8', '#e8a20f', '#e83a18', '#7c5abf', '#64748b'];

export default function Dashboard() {
  const { data: kpis, isLoading: kpiLoading } = useDashboardKPIs();
  const { data: aging, isLoading: agingLoading } = useAgingSummary();

  if (kpiLoading || agingLoading) return <LoadingSpinner />;

  const agingChartData = aging?.buckets
    ? Object.entries(aging.buckets).map(([bucket, data]: any) => ({
        name: bucket,
        lotes: data.count,
        valor: Math.round(data.totalValue / 1000),
      }))
    : [];

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">Vista general del inventario en tiempo real</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard title="SKUs Activos" value={kpis?.totalSkus || 0} color="blue" icon={<HiOutlineCube className="w-6 h-6" />} />
        <KpiCard title="Lotes Activos" value={kpis?.totalLots || 0} color="green" icon={<HiOutlineCollection className="w-6 h-6" />} />
        <KpiCard title="Unidades" value={(kpis?.totalQty || 0).toLocaleString()} color="purple" icon={<HiOutlineTrendingUp className="w-6 h-6" />} />
        <KpiCard title="Valor Total" value={formatCurrency(kpis?.totalValue || 0)} color="amber" icon={<HiOutlineCurrencyDollar className="w-6 h-6" />} />
        <KpiCard title="Alertas Aging" value={kpis?.agingAlerts || 0} subtitle=">90 días" color="red" icon={<HiOutlineExclamation className="w-6 h-6" />} />
        <KpiCard title="Cobertura Crítica" value={kpis?.coverageAlerts || 0} subtitle="<7 días" color="red" icon={<HiOutlineShieldCheck className="w-6 h-6" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aging Bar Chart */}
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Aging de Inventario</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={agingChartData}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#161b27', border: '1px solid #2a3142', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                formatter={(value: any, name: string) => [name === 'valor' ? `$${value}K` : value, name === 'valor' ? 'Valor (CLP)' : 'Lotes']}
              />
              <Bar dataKey="lotes" fill="#1a7fe8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="valor" fill="#4ade80" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Aging Pie Chart */}
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Distribución por Antigüedad</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={agingChartData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                paddingAngle={3}
                dataKey="lotes"
                nameKey="name"
              >
                {agingChartData.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#161b27', border: '1px solid #2a3142', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {agingChartData.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {item.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Total Value */}
      {aging && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-text-muted">Valor Total Inmovilizado</p>
              <p className="text-3xl font-bold text-text-primary mt-1">{formatCurrency(aging.totalValue || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Total Lotes</p>
              <p className="text-3xl font-bold text-brand-blue mt-1">{aging.totalLots}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
