import { usePickingLogs } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PickingLog() {
  const { data: logs, isLoading } = usePickingLogs();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Bitácora de Picking</h1>
        <p className="text-sm text-text-muted mt-1">Registro de auditoría inmutable de extracciones de inventario.</p>
      </div>

      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-bg-tertiary text-text-muted">
              <tr>
                <th className="px-5 py-4 font-medium border-b border-border-primary">Fecha y Hora</th>
                <th className="px-5 py-4 font-medium border-b border-border-primary">Operador</th>
                <th className="px-5 py-4 font-medium border-b border-border-primary">Origen / Cliente</th>
                <th className="px-5 py-4 font-medium border-b border-border-primary">Trazabilidad de Referencia</th>
                <th className="px-5 py-4 font-medium border-b border-border-primary">Detalle de Productos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {logs?.map((log: any) => (
                <tr key={log._id} className="hover:bg-bg-primary/30 transition-colors align-top">
                  <td className="px-5 py-4 font-medium !text-text-primary">
                    {format(new Date(log.createdAt), "dd MMM yy, HH:mm", { locale: es })}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded font-medium">
                      {log.userId?.name || 'Sistema'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-text-primary font-bold">{log.client}</p>
                    <p className="text-xs text-text-muted mt-0.5 capitalize">{log.type.replace('_', ' ')}</p>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-text-secondary">
                    {log.bsaleDocumentNumber ? `Doc BSale: #${log.bsaleDocumentNumber}` : 'Extracción Libre/App'}
                    {log.notes && <p className="mt-1 text-brand-green">{log.notes}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      {log.items.map((item: any, i: number) => (
                        <div key={i} className="flex gap-4 items-center bg-bg-tertiary px-3 py-1.5 rounded-lg border border-border-secondary">
                          <span className="text-xs hover:text-white transition-colors">{item.sku}</span>
                          <span className="font-mono text-brand-orange text-xs text-right w-16">{item.qty} uds.</span>
                          <span className="text-xs text-text-muted italic border-l border-border-primary pl-2">
                            Lote: {item.lot} / Loc: {item.location}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!logs?.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-text-muted italic">
                    Aún no existen registros forenses de picking.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
