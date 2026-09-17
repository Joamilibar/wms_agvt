import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLatestRun, useRunProposal, useOrderFromRun, type ProposalGroup } from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, btnGhost, btnPrimary, fmtInt } from './ui-helpers';

/**
 * The purchase proposal of the latest run, one block per supplier. The
 * planner can change a quantity (with a reason) before turning the block
 * into a draft purchase order, which admin then approves (D12).
 */
export default function ProposalTab() {
  const can = useAuthStore((s) => s.can);
  const { data: run, isLoading } = useLatestRun();
  const { data: groups } = useRunProposal(run?._id ?? null);

  if (isLoading) return <LoadingSpinner />;
  if (!run) return <p className="text-sm text-text-muted">Corre el motor en la pestaña Tablero para tener una propuesta.</p>;

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-muted">
        Propuesta de la corrida <span className="font-mono text-brand-blue">{run.number}</span> ({run.status === 'approved' ? 'aprobada' : 'borrador'}).
        Solo importados y materia prima; los nacionales van a producción. Cambiar una cantidad exige motivo y queda en la orden.
      </p>
      {groups?.length === 0 && <p className="text-sm text-text-muted">Nada que pedir con esta corrida.</p>}
      {groups?.map((g) => <SupplierBlock key={g.supplierId ?? 'none'} runId={run._id} group={g} canOrder={can('admin', 'supervisor')} />)}
    </div>
  );
}

function SupplierBlock({ runId, group, canOrder }: { runId: string; group: ProposalGroup; canOrder: boolean }) {
  const mutation = useOrderFromRun();
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(group.lines.map((l) => [l.sku, l.rounded])));
  const [reason, setReason] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<string | null>(null);

  const units = group.lines.reduce((s, l) => s + (qty[l.sku] ?? 0), 0);
  const value = group.lines.reduce((s, l) => s + (l.unitCost ?? 0) * (qty[l.sku] ?? 0), 0);
  const changed = group.lines.filter((l) => (qty[l.sku] ?? 0) !== l.rounded);
  const missingReason = changed.some((l) => !reason[l.sku]?.trim());

  const submit = async () => {
    if (missingReason) { toast.error('Cada cantidad cambiada necesita un motivo'); return; }
    try {
      const po = await mutation.mutateAsync({
        runId, supplierId: group.supplierId,
        overrides: changed.map((l) => ({ sku: l.sku, qty: qty[l.sku], reason: reason[l.sku] })),
      });
      setCreated(po.number);
      toast.success(`${po.number} creada en borrador para ${group.supplierName}`);
    } catch (e) {
      toast.error('No se pudo crear la orden: ' + getErrorMessage(e));
    }
  };

  return (
    <section className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{group.supplierName}</h3>
        <span className="text-xs text-text-muted">{group.lines.length} SKU · {fmtInt(units)} u.{value > 0 ? ` · ${group.currency} ${fmtInt(value)}` : ''}{group.cadenceDays ? ` · pide cada ${group.cadenceDays} d` : ''}</span>
        {group.containerMin && (
          <Badge label={units >= group.containerMin ? `mínimo ${fmtInt(group.containerMin)} cubierto` : `faltan ${fmtInt(group.containerMin - units)} para el mínimo`} variant={units >= group.containerMin ? 'green' : 'amber'} />
        )}
        <span className="flex-1" />
        {created ? <Badge label={`${created} creada`} variant="green" /> : canOrder && (
          <button onClick={submit} disabled={mutation.isPending || units <= 0} className={btnPrimary}>Crear OC en borrador</button>
        )}
      </div>
      <TableShell headers={['SKU', 'Producto', 'Estado', 'Dem./mes horizonte', 'Posición', 'Objetivo', 'Sugerido', 'Cantidad', 'Motivo del cambio']}>
        {group.lines.length === 0 && <Empty colSpan={9} text="Sin líneas" />}
        {group.lines.map((l) => {
          const isChanged = (qty[l.sku] ?? 0) !== l.rounded;
          return (
            <tr key={l.sku} className="border-b border-border-secondary">
              <td className="px-3 py-2 font-mono text-xs text-brand-blue">{l.sku}</td>
              <td className="px-3 py-2 text-xs text-text-primary max-w-[280px] truncate" title={l.name}>{l.name}</td>
              <td className="px-3 py-2"><Badge label={l.state === 'QUIEBRE' ? 'Quiebre' : l.state === 'REPONER' ? 'Reponer' : l.state} variant={l.state === 'QUIEBRE' ? 'red' : 'amber'} /></td>
              <td className="px-3 py-2 text-xs text-text-secondary">{Math.round(l.demandMonthly * 10) / 10}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{fmtInt(l.position)}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{fmtInt(Math.round(l.target))}</td>
              <td className={`px-3 py-2 text-xs ${l.moqExceedsHorizon ? 'text-brand-amber' : 'text-text-secondary'}`}>{fmtInt(l.rounded)}{l.moqExceedsHorizon && <span title="El MOQ cubre más del horizonte"> !</span>}</td>
              <td className="px-3 py-2">
                {canOrder && !created ? (
                  <input type="number" min={0} value={qty[l.sku] ?? 0} onChange={(e) => setQty({ ...qty, [l.sku]: Number(e.target.value) })} className={`${inputCls} w-24 ${isChanged ? 'border-brand-amber/60' : ''}`} />
                ) : fmtInt(qty[l.sku] ?? 0)}
              </td>
              <td className="px-3 py-2">
                {isChanged && !created && <input value={reason[l.sku] ?? ''} onChange={(e) => setReason({ ...reason, [l.sku]: e.target.value })} placeholder="obligatorio" className={`${inputCls} w-56`} />}
              </td>
            </tr>
          );
        })}
      </TableShell>
      {changed.length > 0 && !created && <p className="text-[11px] text-text-muted">{changed.length} cantidad(es) distintas a la sugerida.</p>}
      {created && <p className="text-[11px] text-text-muted">La orden está en la pestaña Órdenes de compra, pendiente de aprobación. <button className={btnGhost} onClick={() => setCreated(null)}>Crear otra</button></p>}
    </section>
  );
}
