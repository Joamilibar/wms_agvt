import { useBsaleStatus } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Badge from '../components/ui/Badge';

export default function BSaleConfig() {
  const { data, isLoading } = useBsaleStatus();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Integración BSale</h1>
        <p className="text-sm text-text-muted mt-1">Estado de conexión y configuración del ERP BSale</p>
      </div>

      <div className="bg-bg-secondary border border-border-primary rounded-xl p-6 max-w-lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Estado</span>
            <Badge
              label={data?.configured ? 'Configurado' : 'No Configurado'}
              variant={data?.configured ? 'green' : 'amber'}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">URL Base</span>
            <span className="text-sm font-mono text-text-muted">{data?.baseUrl}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Última Sincronización</span>
            <span className="text-sm text-text-muted">{data?.lastSync || 'Nunca'}</span>
          </div>
        </div>

        {!data?.configured && (
          <div className="mt-6 p-4 bg-brand-amber/10 border border-brand-amber/30 rounded-lg">
            <p className="text-sm text-brand-amber font-medium">Token no configurado</p>
            <p className="text-xs text-text-muted mt-1">
              Configure la variable de entorno <code className="text-brand-blue">BSALE_TOKEN</code> para habilitar la sincronización automática con BSale.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
