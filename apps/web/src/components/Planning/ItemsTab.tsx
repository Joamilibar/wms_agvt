import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  usePlanningItems, usePlanningAlerts, useSuppliers, useUpdatePlanningItem,
  type PlanningItem, type ItemOrigin, type Lifecycle,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import KpiCard from '../ui/KpiCard';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary } from './ui-helpers';

const ORIGIN_LABEL: Record<ItemOrigin, string> = {
  imported: 'Importado', national: 'Nacional', raw_material: 'Materia prima', supply: 'Insumo', pack: 'Pack', service: 'Servicio', unknown: 'Sin definir',
};
const LIFECYCLE_LABEL: Record<Lifecycle, string> = { new: 'Nuevo', active: 'Activo', phase_out: 'Descontinuando', discontinued: 'Descontinuado' };

/**
 * The supply master per SKU. The two alerts at the top are the ones that
 * matter for phase 0 (D6): an imported item without a supplier has no lead
 * time, and an item of unknown origin is not planned at all.
 */
export default function ItemsTab() {
  const can = useAuthStore((s) => s.can);
  const { data: alerts } = usePlanningAlerts();
  const { data: suppliers } = useSuppliers();
  const [origin, setOrigin] = useState('');
  const [missing, setMissing] = useState(false);
  const [search, setSearch] = useState('');
  const { data: items, isLoading } = usePlanningItems({ origin: origin || undefined, missingSupply: missing ? 'true' : undefined, search: search || undefined });
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Fichas" value={alerts?.total ?? '…'} subtitle="Un SKU, una ficha" color="blue" />
        <KpiCard title="Importados sin proveedor" value={alerts?.importedWithoutSupplier ?? '…'} subtitle="Sin lead time: el ROP es solo la seguridad" color={alerts?.importedWithoutSupplier ? 'red' : 'green'} />
        <KpiCard title="Origen sin definir" value={alerts?.unknownOrigin ?? '…'} subtitle="Con lotes o ventas, pero fuera de la planilla" color={alerts?.unknownOrigin ? 'amber' : 'green'} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SKU, nombre o categoría" className={`${inputCls} w-64`} />
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={selectCls}>
          <option value="">Todos los orígenes</option>
          {(Object.keys(ORIGIN_LABEL) as ItemOrigin[]).map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} className="accent-brand-blue" />
          Solo importados sin proveedor
        </label>
        <span className="text-xs text-text-muted ml-auto">{items ? `${items.length} fichas` : ''}</span>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <TableShell headers={['SKU', 'Producto', 'Categoría', 'Origen', 'Proveedor', 'LT / tránsito', 'MOQ', 'Ciclo', '']}>
          {items?.length === 0 && <Empty colSpan={9} text="Ninguna ficha coincide" />}
          {items?.map((it) => editing === it.sku
            ? <EditRow key={it.sku} item={it} suppliers={suppliers ?? []} onClose={() => setEditing(null)} />
            : (
              <tr key={it.sku} className="border-b border-border-secondary hover:bg-bg-tertiary/50">
                <td className="px-3 py-2 font-mono text-xs text-brand-blue">{it.sku}{it.isHotelLine && <span className="ml-1 text-text-muted" title="Línea hotelera">H</span>}</td>
                <td className="px-3 py-2 text-text-primary">{it.name || <span className="text-text-muted">—</span>}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{it.category}</td>
                <td className="px-3 py-2"><Badge label={ORIGIN_LABEL[it.origin]} variant={it.origin === 'unknown' ? 'amber' : it.origin === 'imported' ? 'blue' : 'gray'} /></td>
                <td className="px-3 py-2 text-xs">
                  {it.supplierId?.name ?? (it.origin === 'imported' ? <span className="text-brand-red font-medium">falta</span> : <span className="text-text-muted">—</span>)}
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
                  {fmtDays(it.leadTimeDays ?? it.supplierId?.leadTimeDays)} / {fmtDays(it.transitDays ?? it.supplierId?.transitDays)}
                  {it.leadTimeDays == null && it.supplierId && <span className="text-text-muted" title="Heredado del proveedor"> ↑</span>}
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary">{it.moq ?? '—'}{it.orderMultiple > 1 ? ` ×${it.orderMultiple}` : ''}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{LIFECYCLE_LABEL[it.lifecycle]}</td>
                <td className="px-3 py-2 text-right">{can('admin', 'supervisor') && <button onClick={() => setEditing(it.sku)} className={btnGhost}>Editar</button>}</td>
              </tr>
            ))}
        </TableShell>
      )}
    </div>
  );
}

const fmtDays = (d: number | null | undefined) => (d == null ? '—' : `${d} d`);

function EditRow({ item, suppliers, onClose }: { item: PlanningItem; suppliers: { _id: string; name: string }[]; onClose: () => void }) {
  const mutation = useUpdatePlanningItem();
  const [form, setForm] = useState({
    origin: item.origin,
    supplierId: item.supplierId?._id ?? '',
    leadTimeDays: item.leadTimeDays ?? '',
    transitDays: item.transitDays ?? '',
    moq: item.moq ?? '',
    orderMultiple: item.orderMultiple,
    lifecycle: item.lifecycle,
  });
  const num = (v: string | number) => (v === '' ? null : Number(v));

  const save = async () => {
    try {
      await mutation.mutateAsync({
        sku: item.sku,
        data: {
          origin: form.origin,
          supplierId: form.supplierId || null,
          leadTimeDays: num(form.leadTimeDays),
          transitDays: num(form.transitDays),
          moq: num(form.moq),
          orderMultiple: Number(form.orderMultiple) || 1,
          lifecycle: form.lifecycle,
        },
      });
      toast.success(`Ficha ${item.sku} guardada`);
      onClose();
    } catch (e) {
      toast.error('No se pudo guardar: ' + getErrorMessage(e));
    }
  };

  return (
    <tr className="border-b border-border-secondary bg-bg-tertiary/40">
      <td className="px-3 py-2 font-mono text-xs text-brand-blue">{item.sku}</td>
      <td className="px-3 py-2 text-text-primary text-xs">{item.name}</td>
      <td className="px-3 py-2 text-xs text-text-secondary">{item.category}</td>
      <td className="px-3 py-2">
        <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value as ItemOrigin })} className={selectCls}>
          {(Object.keys(ORIGIN_LABEL) as ItemOrigin[]).map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={selectCls}>
          <option value="">— sin proveedor —</option>
          {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <input type="number" min={0} value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} placeholder="hereda" className={`${inputCls} w-20`} />
        <span className="text-text-muted mx-1">/</span>
        <input type="number" min={0} value={form.transitDays} onChange={(e) => setForm({ ...form, transitDays: e.target.value })} placeholder="hereda" className={`${inputCls} w-20`} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <input type="number" min={0} value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} placeholder="—" className={`${inputCls} w-20`} />
        <span className="text-text-muted mx-1">×</span>
        <input type="number" min={1} value={form.orderMultiple} onChange={(e) => setForm({ ...form, orderMultiple: Number(e.target.value) })} className={`${inputCls} w-16`} />
      </td>
      <td className="px-3 py-2">
        <select value={form.lifecycle} onChange={(e) => setForm({ ...form, lifecycle: e.target.value as Lifecycle })} className={selectCls}>
          {(Object.keys(LIFECYCLE_LABEL) as Lifecycle[]).map((l) => <option key={l} value={l}>{LIFECYCLE_LABEL[l]}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button onClick={save} disabled={mutation.isPending} className={btnPrimary}>Guardar</button>
        <button onClick={onClose} className={`${btnGhost} ml-1`}>Cancelar</button>
      </td>
    </tr>
  );
}
