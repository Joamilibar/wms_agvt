import { useState } from 'react';
import { useAging, useAgingSummary } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const RISK_COLOR: Record<string, string> = {
  ok:      'bg-brand-green/10  text-brand-green  border-brand-green/20',
  medio:   'bg-brand-amber/10  text-brand-amber  border-brand-amber/20',
  alto:    'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
  critico: 'bg-brand-red/10   text-brand-red    border-brand-red/20',
};
const RISK_LABEL: Record<string, string> = {
  ok: 'OK', medio: 'Medio', alto: 'Alto', critico: 'Crítico',
};

type Tab = 'lotes' | 'sku' | 'inmovilizado';

export default function Aging() {
  const [tab, setTab] = useState<Tab>('lotes');
  const [searchSku, setSearchSku] = useState('');
  const { data: lots, isLoading: lotsLoading } = useAging();
  const { data: summary, isLoading: summaryLoading } = useAgingSummary();

  if (lotsLoading || summaryLoading) return <LoadingSpinner />;

  const fmtClp = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
  const fmtDate = (d: string) => {
    try { return format(new Date(d), 'dd MMM yyyy', { locale: es }); } catch { return d; }
  };

  const allLots: any[] = lots || [];
  const filtered = searchSku
    ? allLots.filter(l => l.sku?.toLowerCase().includes(searchSku.toLowerCase()) || l.name?.toLowerCase().includes(searchSku.toLowerCase()))
    : allLots;

  // ── SKU aggregation ──────────────────────────────────────────────────────
  const skuMap = new Map<string, { name: string; qty: number; value: number; oldestDate: string; newestDate: string; maxDays: number; avgDays: number; lotCount: number; risk: string }>();
  for (const lot of allLots) {
    const existing = skuMap.get(lot.sku);
    if (existing) {
      existing.qty += lot.qty;
      existing.value += lot.value;
      existing.maxDays = Math.max(existing.maxDays, lot.days);
      existing.avgDays = Math.round((existing.avgDays + lot.days) / 2);
      existing.lotCount++;
      if (lot.entryDate < existing.oldestDate) existing.oldestDate = lot.entryDate;
      if (lot.entryDate > existing.newestDate) existing.newestDate = lot.entryDate;
      // Worst risk wins
      const rankRisk = (r: string) => ({ ok: 0, medio: 1, alto: 2, critico: 3 }[r] ?? 0);
      if (rankRisk(lot.risk) > rankRisk(existing.risk)) existing.risk = lot.risk;
    } else {
      skuMap.set(lot.sku, {
        name: lot.name,
        qty: lot.qty,
        value: lot.value,
        oldestDate: lot.entryDate,
        newestDate: lot.entryDate,
        maxDays: lot.days,
        avgDays: lot.days,
        lotCount: 1,
        risk: lot.risk,
      });
    }
  }
  const skuList = [...skuMap.entries()].map(([sku, data]) => ({ sku, ...data }))
    .sort((a, b) => b.maxDays - a.maxDays);

  // ── Immobilized: risk === 'alto' | 'critico' ──────────────────────────────
  const immobilized = allLots.filter(l => l.risk === 'alto' || l.risk === 'critico')
    .sort((a, b) => b.days - a.days);

  const buckets = summary?.buckets || {};

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'lotes', label: 'Por Lote', count: allLots.length },
    { id: 'sku', label: 'Por SKU', count: skuList.length },
    { id: 'inmovilizado', label: 'Stock Inmovilizado', count: immobilized.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Aging Report</h1>
        <p className="text-sm text-text-muted mt-1">
          Antigüedad de inventario — Identificación de stock inmovilizado
        </p>
      </div>

      {/* Bucket summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Object.entries(buckets).map(([bucket, data]: any) => (
          <div key={bucket} className="bg-bg-secondary border border-border-primary rounded-xl p-3 text-center">
            <p className="text-[10px] text-text-muted mb-1 font-medium">{bucket} días</p>
            <p className="text-xl font-bold text-text-primary">{data.count}</p>
            <p className="text-[10px] text-brand-green mt-0.5">{fmtClp(data.totalValue)}</p>
          </div>
        ))}
      </div>

      {/* Total immobilized value */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">Valor Total Inventario Activo</p>
          <p className="text-xs text-text-muted mt-0.5">{summary?.totalLots || 0} lotes registrados</p>
        </div>
        <span className="text-2xl font-bold text-brand-amber">{fmtClp(summary?.totalValue || 0)}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border-primary">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${tab === t.id ? 'bg-brand-blue/15 text-brand-blue' : 'bg-bg-tertiary text-text-muted'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== 'inmovilizado' && (
        <input
          type="text"
          value={searchSku}
          onChange={e => setSearchSku(e.target.value)}
          placeholder="Buscar por SKU o nombre de producto..."
          className="w-full max-w-sm bg-bg-secondary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
        />
      )}

      {/* ── TAB: POR LOTE ─────────────────────────────────────────────── */}
      {tab === 'lotes' && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-primary bg-bg-tertiary/40">
                  {['Riesgo', 'SKU / Producto', 'Lote BSale', 'Fecha Entrada', 'Días', 'Qty', 'Valor', 'Bodega', 'Ubicación'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-secondary">
                {filtered.map((lot: any, i: number) => (
                  <tr key={i} className="hover:bg-bg-tertiary/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${RISK_COLOR[lot.risk]}`}>
                        {RISK_LABEL[lot.risk]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-brand-blue text-xs">{lot.sku}</p>
                      <p className="text-xs text-text-muted mt-0.5 max-w-[200px] truncate">{lot.name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{lot.lot}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{fmtDate(lot.entryDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${lot.days > 120 ? 'text-brand-red' : lot.days > 90 ? 'text-brand-amber' : 'text-text-primary'}`}>
                        {lot.days}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-text-primary">{lot.qty}</td>
                    <td className="px-4 py-3 text-xs text-brand-green whitespace-nowrap">{fmtClp(lot.value)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{lot.warehouse}</td>
                    <td className="px-4 py-3 text-xs">
                      {lot.location === 'Sin ubicación asignada'
                        ? <span className="text-text-muted italic">{lot.location}</span>
                        : <span className="text-text-secondary font-mono">{lot.location}</span>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-xs text-text-muted">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: POR SKU ──────────────────────────────────────────────── */}
      {tab === 'sku' && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-primary bg-bg-tertiary/40">
                  {['Riesgo', 'SKU / Producto', 'Días Máx.', 'Días Prom.', 'Lotes', 'Qty Total', 'Valor Total', 'Entrada más antigua'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-secondary">
                {(searchSku ? skuList.filter(s => s.sku.toLowerCase().includes(searchSku.toLowerCase()) || s.name.toLowerCase().includes(searchSku.toLowerCase())) : skuList).map((s, i) => (
                  <tr key={i} className="hover:bg-bg-tertiary/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${RISK_COLOR[s.risk]}`}>
                        {RISK_LABEL[s.risk]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-brand-blue text-xs">{s.sku}</p>
                      <p className="text-xs text-text-muted mt-0.5 max-w-[220px] truncate">{s.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${s.maxDays > 120 ? 'text-brand-red' : s.maxDays > 90 ? 'text-brand-amber' : 'text-text-primary'}`}>
                        {s.maxDays}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{s.avgDays}</td>
                    <td className="px-4 py-3 text-text-muted">{s.lotCount}</td>
                    <td className="px-4 py-3 font-semibold text-text-primary">{s.qty}</td>
                    <td className="px-4 py-3 text-xs text-brand-green whitespace-nowrap">{fmtClp(s.value)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{fmtDate(s.oldestDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: STOCK INMOVILIZADO ───────────────────────────────────── */}
      {tab === 'inmovilizado' && (
        <div className="space-y-4">
          {immobilized.length === 0 ? (
            <div className="bg-bg-secondary border border-border-primary rounded-xl p-8 text-center">
              <p className="text-brand-green font-semibold">✓ Sin stock inmovilizado detectado</p>
              <p className="text-xs text-text-muted mt-1">Todos los lotes tienen menos de 90 días de antigüedad.</p>
            </div>
          ) : (
            <>
              <div className="bg-brand-red/5 border border-brand-red/20 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-brand-red font-medium">⚠ {immobilized.length} lotes con más de 90 días sin movimiento</span>
                <span className="text-sm font-bold text-brand-red">{fmtClp(immobilized.reduce((s, l) => s + l.value, 0))}</span>
              </div>
              <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-primary bg-bg-tertiary/40">
                        {['Riesgo', 'SKU / Producto', 'Lote', 'Días inmovilizado', 'Qty', 'Valor Inmovilizado', 'Bodega', 'Ubicación'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-secondary">
                      {immobilized.map((lot: any, i: number) => (
                        <tr key={i} className={`hover:bg-bg-tertiary/50 transition-colors ${lot.risk === 'critico' ? 'bg-brand-red/3' : ''}`}>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${RISK_COLOR[lot.risk]}`}>
                              {RISK_LABEL[lot.risk]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono text-brand-blue text-xs">{lot.sku}</p>
                            <p className="text-xs text-text-muted mt-0.5 max-w-[200px] truncate">{lot.name}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-text-secondary">{lot.lot}</td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-brand-red text-lg">{lot.days}</span>
                            <span className="text-xs text-text-muted ml-1">días</span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-text-primary">{lot.qty}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-brand-red whitespace-nowrap">{fmtClp(lot.value)}</td>
                          <td className="px-4 py-3 text-xs text-text-muted">{lot.warehouse}</td>
                          <td className="px-4 py-3 text-xs">
                            {lot.location === 'Sin ubicación asignada'
                              ? <span className="text-text-muted italic">{lot.location}</span>
                              : <span className="text-text-secondary font-mono">{lot.location}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
