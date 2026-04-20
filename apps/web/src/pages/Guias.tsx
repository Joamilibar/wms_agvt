import { useGuides } from '../hooks/useApi';
import Badge, { statusVariant, statusLabel } from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Guias() {
  const { data, isLoading } = useGuides({ limit: 20 });

  if (isLoading) return <LoadingSpinner />;
  const guides = data?.data || [];

  const fmt = (d: string) => { try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: es }); } catch { return '-'; } };
  const fmtCurrency = (v: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Guías de Despacho</h1>
        <p className="text-sm text-text-muted mt-1">Guías internas y externas con trazabilidad</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {guides.map((guide: any) => (
          <div key={guide._id} className="bg-bg-secondary border border-border-primary rounded-xl p-5 hover:border-brand-blue/30 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-brand-blue font-semibold">{guide.guideId}</span>
              <div className="flex items-center gap-2">
                <Badge label={guide.type === 'internal' ? 'Interna' : 'Externa'} variant={guide.type === 'internal' ? 'purple' : 'blue'} />
                <Badge label={statusLabel(guide.status)} variant={statusVariant(guide.status)} />
              </div>
            </div>

            {guide.type === 'external' ? (
              <div className="text-sm">
                <p className="text-text-primary font-medium">{guide.client}</p>
                <p className="text-xs text-text-muted">{guide.clientRut} · {guide.clientAddress}</p>
              </div>
            ) : (
              <div className="text-sm">
                <p className="text-text-secondary">{guide.originWarehouse} → {guide.destinationWarehouse}</p>
              </div>
            )}

            {/* Items */}
            <div className="mt-3 space-y-1">
              {guide.items?.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-bg-tertiary rounded px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-muted">{item.sku}</span>
                    <span className="text-xs text-text-secondary">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-text-primary">{item.qty} uds</span>
                    <span className="text-xs text-brand-green">{fmtCurrency(item.qty * item.unitCost)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Dates */}
            <div className="mt-3 flex gap-4 text-xs text-text-muted">
              {guide.emittedAt && <span>Emitida: {fmt(guide.emittedAt)}</span>}
              {guide.receivedAt && <span>Recibida: {fmt(guide.receivedAt)}</span>}
            </div>

            {/* BSale */}
            {guide.bsaleStatus !== 'not_applicable' && (
              <div className="mt-2">
                <Badge label={`BSale: ${guide.bsaleStatus}`} variant={statusVariant(guide.bsaleStatus)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
