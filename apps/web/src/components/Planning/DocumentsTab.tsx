import { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useHistoryDocuments, useOverrideChannel, usePlanningWindow, type Channel, type HistoryDocument } from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary, fmtInt, fmtClp, monthLabel } from './ui-helpers';

/**
 * Every document with the channel the rule gave it (D1) and a way to
 * reclassify one by hand. The override survives a reload of the history.
 */
export default function DocumentsTab() {
  const can = useAuthStore((s) => s.can);
  const { data: window } = usePlanningWindow();
  const [channel, setChannel] = useState('');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useHistoryDocuments({ channel: channel || undefined, month: month || undefined, search: search || undefined, page });
  const [editing, setEditing] = useState<HistoryDocument | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">Ambos canales</option>
          <option value="retail">Retail</option>
          <option value="project">Proyectos</option>
        </select>
        <select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">Todos los meses</option>
          {(window?.monthKeys ?? []).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cliente o folio (tipo#número)" className={`${inputCls} w-64`} />
        <span className="text-xs text-text-muted ml-auto">{data ? `${fmtInt(data.total)} documentos` : ''}</span>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <TableShell
          headers={['Fecha', 'Documento', 'Sucursal', 'Cliente', 'Unid.', 'Neto', 'Canal', '']}
          footer={data && data.total > data.limit && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-border-primary">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className={btnGhost}>Anterior</button>
              <span className="text-xs text-text-muted">Página {page} de {Math.ceil(data.total / data.limit)}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(data.total / data.limit)} className={btnGhost}>Siguiente</button>
            </div>
          )}
        >
          {data?.data.length === 0 && <Empty colSpan={8} text="Ningún documento coincide" />}
          {data?.data.map((d) => (
            <tr key={d._id} className="border-b border-border-secondary hover:bg-bg-tertiary/50">
              <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{format(new Date(d.date), 'dd-MM-yyyy')}</td>
              <td className="px-3 py-2">
                <div className="font-mono text-xs text-brand-blue">{d.docKey}</div>
                <div className="text-[11px] text-text-muted">{d.docType}{d.refDocId ? ' · anula factura' : ''}{d.isOutlier ? ' · outlier' : ''}</div>
              </td>
              <td className="px-3 py-2 text-xs text-text-secondary">{d.warehouse}</td>
              <td className="px-3 py-2 text-text-primary">
                {d.customerName || <span className="text-text-muted">—</span>}
                {d.customerRut && <div className="text-[11px] font-mono text-text-muted">{d.customerRut}</div>}
              </td>
              <td className={`px-3 py-2 font-semibold ${d.units < 0 ? 'text-brand-red' : 'text-text-primary'}`}>{fmtInt(d.units)}</td>
              <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{fmtClp(d.net)}</td>
              <td className="px-3 py-2">
                <Badge label={d.channel === 'project' ? 'Proyecto' : 'Retail'} variant={d.channel === 'project' ? 'purple' : 'blue'} />
                {d.channelOverride && <div className="text-[11px] text-brand-amber mt-1" title={d.channelReason}>manual</div>}
              </td>
              <td className="px-3 py-2 text-right">
                {can('admin', 'supervisor') && <button onClick={() => setEditing(d)} className={btnGhost}>Reclasificar</button>}
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      {editing && <OverrideForm doc={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OverrideForm({ doc, onClose }: { doc: HistoryDocument; onClose: () => void }) {
  const mutation = useOverrideChannel();
  const [channel, setChannel] = useState<Channel | ''>(doc.channelOverride ?? '');
  const [reason, setReason] = useState(doc.channelReason);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ bsaleDocId: doc._id, channel: channel || null, reason });
      toast.success(channel ? `Documento ${doc.docKey} marcado como ${channel === 'project' ? 'proyecto' : 'retail'}` : `Documento ${doc.docKey} vuelve a la regla`);
      onClose();
    } catch (err) {
      toast.error('No se pudo reclasificar: ' + getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="bg-bg-secondary border border-brand-amber/40 rounded-xl p-4 flex flex-wrap items-end gap-3">
      <div className="text-sm text-text-primary">
        <div className="font-mono text-xs text-brand-blue">{doc.docKey}</div>
        <div>{doc.customerName || 'sin cliente'} · {fmtInt(doc.units)} u. · hoy: {doc.channel === 'project' ? 'proyecto' : 'retail'}</div>
      </div>
      <label className="text-xs text-text-muted">
        Canal
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')} className={`${selectCls} block mt-1`}>
          <option value="">Según la regla</option>
          <option value="retail">Retail</option>
          <option value="project">Proyecto</option>
        </select>
      </label>
      <label className="text-xs text-text-muted flex-1 min-w-[200px]">
        Motivo
        <input value={reason} onChange={(e) => setReason(e.target.value)} required={!!channel} className={`${inputCls} block mt-1 w-full`} placeholder="Por qué se reclasifica" />
      </label>
      <button type="submit" disabled={mutation.isPending} className={btnPrimary}>Guardar</button>
      <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
    </form>
  );
}
