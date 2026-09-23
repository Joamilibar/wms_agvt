import { useState } from 'react';
import { useBsaleStatus, useSyncBsaleStock, useSyncBsaleCosts, useBsaleSyncJob, type BsaleCostSyncResult } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Badge from '../components/ui/Badge';
import { HiOutlineRefresh, HiOutlineCheckCircle, HiOutlineExclamationCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { confirmDialog } from '../lib/confirm';
import { getErrorMessage } from '../lib/errors';
import { API_URL } from '../lib/api';

export default function BSaleConfig() {
  const { data, isLoading, isError, error, refetch } = useBsaleStatus();
  const syncMutation = useSyncBsaleStock();
  const costsMutation = useSyncBsaleCosts();
  // M-07: the sync runs on a worker now; we hold the job id and poll it.
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useBsaleSyncJob(jobId);

  const running = syncMutation.isPending || costsMutation.isPending || (!!job && !['completed', 'failed'].includes(job.state));
  // A stock job carries `skusChecked` and its cost pass under `costs`; a cost-only job is the cost result itself.
  const syncResult = job?.state === 'completed' && job.result && 'skusChecked' in job.result ? job.result : null;
  const costResult: BsaleCostSyncResult | null = job?.state === 'completed' && job.result
    ? ('skusChecked' in job.result ? job.result.costs : job.result)
    : null;

  const handleSync = async () => {
    const confirmed = await confirmDialog({
      title: 'Sincronizar inventario desde BSale',
      detail:
        'BSale es la fuente de verdad de las cantidades: los saldos del WMS se ajustan ' +
        'a los suyos. Los lotes conservan su codigo y su fecha de entrada, asi que el ' +
        'aging report sigue siendo valido; solo el sobrante sin explicacion entra como ' +
        'lote nuevo. No se tocan unidades reservadas por una orden en curso. Al terminar, ' +
        'cada lote queda valorizado al costo promedio que BSale informa por SKU.',
      confirmLabel: 'Sincronizar',
    });
    if (!confirmed) return;
    setJobId(null);
    try {
      // false = reconcile. `true` is the escape hatch that rebuilds every lot
      // from scratch and takes the aging report with it.
      const { jobId: id } = await syncMutation.mutateAsync(false);
      setJobId(id);
    } catch (e) {
      toast.error('No se pudo encolar la sincronizacion: ' + getErrorMessage(e));
    }
  };

  const handleCosts = async () => {
    setJobId(null);
    try {
      const { jobId: id } = await costsMutation.mutateAsync();
      setJobId(id);
    } catch (e) {
      toast.error('No se pudo encolar la actualizacion de costos: ' + getErrorMessage(e));
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Integración BSale</h1>
        <p className="text-sm text-text-muted mt-1">Estado de conexión y sincronización con BSale ERP</p>
      </div>

      {/* Connection status */}
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Estado de Conexión</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Estado</span>
            <Badge
              label={isError ? 'Sin conexión' : data?.configured ? 'Configurado' : 'No Configurado'}
              variant={isError ? 'red' : data?.configured ? 'green' : 'amber'}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">URL Base</span>
            <span className="text-sm font-mono text-text-muted">{data?.baseUrl ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Última Sincronización</span>
            <span className="text-sm text-text-muted">{isError ? '—' : data?.lastSync || 'Nunca'}</span>
          </div>
        </div>

        {/* A failed request used to fall through to "Token no configurado": `data`
            comes back undefined, so `!data?.configured` reads as "the API says
            there is no token" when the API in fact never answered. A stack that
            is simply not up then reads as a .env problem, and the .env is the
            first place someone looks. The two states are now told apart, and
            only the second one blames the token. */}
        {isError ? (
          <div className="mt-6 p-4 bg-brand-red/10 border border-brand-red/30 rounded-lg">
            <p className="text-sm text-brand-red font-medium">No se pudo contactar la API</p>
            <p className="text-xs text-text-muted mt-1">
              El estado de la integración es desconocido: esto no dice nada sobre el token.
              Verifique que la API esté corriendo en <code className="text-brand-blue">{API_URL}</code>.
            </p>
            <p className="text-xs text-text-muted mt-2 font-mono">{getErrorMessage(error)}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-xs text-brand-blue hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : !data?.configured ? (
          <div className="mt-6 p-4 bg-brand-amber/10 border border-brand-amber/30 rounded-lg">
            <p className="text-sm text-brand-amber font-medium">Token no configurado</p>
            <p className="text-xs text-text-muted mt-1">
              Configure la variable de entorno <code className="text-brand-blue">BSALE_TOKEN</code> para habilitar la integración.
            </p>
          </div>
        ) : null}
      </div>

      {/* Sync stock section */}
      {data?.configured && (
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text-secondary mb-1">Sincronizar Inventario desde BSale</h2>
          <p className="text-xs text-text-muted mb-5 leading-relaxed">
            Importa las recepciones de stock registradas en BSale (movimientos tipo "Importar Stock") y
            reconstruye los lotes de inventario en WMS con fechas reales de entrada.<br/>
            <span className="text-brand-orange font-medium">⚠ Esto eliminará los lotes actuales (datos de prueba) y los reemplazará con la data real de BSale.</span>
          </p>

          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white text-sm font-semibold rounded-lg hover:bg-brand-blue/90 disabled:opacity-50 transition-all hover:shadow-lg hover:shadow-brand-blue/20"
          >
            <HiOutlineRefresh className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Sincronizando en segundo plano...' : 'Iniciar Sincronización'}
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleCosts}
              disabled={running}
              className="px-4 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              Solo actualizar costos
            </button>
            <span className="text-[11px] text-text-muted">
              Valoriza cada lote al costo promedio de BSale por SKU (CLP). Corre solo al final de cada sincronización y el día 1 de cada mes.
            </span>
          </div>

          {/* Job in flight: the request returned immediately, the work did not. */}
          {jobId && running && (
            <div className="mt-5 p-4 rounded-lg border border-brand-blue/30 bg-brand-blue/5">
              <p className="text-sm font-semibold text-brand-blue">Sincronización en curso</p>
              <p className="text-xs text-text-muted mt-1">
                Se está ejecutando en segundo plano; puedes salir de esta pantalla.
                Estado: {job?.state ?? 'encolada'}
                {job && job.attemptsMade > 0 ? ` · intento ${job.attemptsMade + 1}` : ''}
              </p>
              <p className="text-[10px] text-text-muted font-mono mt-2">job {jobId}</p>
            </div>
          )}

          {/* Job failed after exhausting its retries */}
          {job?.state === 'failed' && (
            <div className="mt-5 p-4 rounded-lg border border-brand-red/30 bg-brand-red/5">
              <div className="flex items-center gap-2 mb-2">
                <HiOutlineExclamationCircle className="w-5 h-5 text-brand-red" />
                <span className="text-sm font-semibold text-brand-red">La sincronización falló</span>
              </div>
              <p className="text-xs text-text-muted font-mono">{job.failedReason}</p>
            </div>
          )}

          {/* Sync result */}
          {syncResult && (
            <div className="mt-5 p-4 rounded-lg border border-brand-green/30 bg-brand-green/5">
              <div className="flex items-center gap-2 mb-3">
                <HiOutlineCheckCircle className="w-5 h-5 text-brand-green" />
                <span className="text-sm font-semibold text-brand-green">
                Sincronización completada · {syncResult.skusChecked} SKU revisados
              </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: 'Sin Cambios', value: syncResult.unchanged, color: 'text-text-secondary' },
                  { label: 'Ajustados', value: syncResult.increased + syncResult.decreased, color: 'text-brand-blue' },
                  { label: 'Lotes Creados', value: syncResult.created, color: 'text-brand-green' },
                ].map(s => (
                  <div key={s.label} className="bg-bg-tertiary rounded-lg p-3 text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              {syncResult.costs && <CostSummary costs={syncResult.costs} />}
              {syncResult.errors.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center gap-1 mb-1">
                    <HiOutlineExclamationCircle className="w-4 h-4 text-brand-orange" />
                    <span className="text-xs text-brand-orange font-medium">{syncResult.errors.length} avisos</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {syncResult.errors.slice(0, 20).map((e, i) => (
                      <p key={i} className="text-[10px] text-text-muted font-mono">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cost-only job */}
          {costResult && !syncResult && (
            <div className="mt-5 p-4 rounded-lg border border-brand-green/30 bg-brand-green/5">
              <div className="flex items-center gap-2 mb-1">
                <HiOutlineCheckCircle className="w-5 h-5 text-brand-green" />
                <span className="text-sm font-semibold text-brand-green">Costos actualizados</span>
              </div>
              <CostSummary costs={costResult} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostSummary({ costs }: { costs: BsaleCostSyncResult }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-text-secondary">
        Costos: <span className="text-text-primary font-medium">{costs.valued}</span> de {costs.skus} SKU valorizados desde BSale · {costs.lotsUpdated} lotes actualizados
        {costs.withoutCost.length > 0 && <span className="text-brand-orange"> · {costs.withoutCost.length} sin costo en BSale</span>}
      </p>
      {costs.withoutCost.length > 0 && (
        <p className="text-[10px] text-text-muted font-mono mt-1 break-all">{costs.withoutCost.slice(0, 30).join(' · ')}{costs.withoutCost.length > 30 ? ' …' : ''}</p>
      )}
      {costs.errors.slice(0, 10).map((e, i) => <p key={i} className="text-[10px] text-brand-red font-mono">{e}</p>)}
    </div>
  );
}
