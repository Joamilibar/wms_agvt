import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  usePlanningWarehouses, useUpdateWarehouse, useSuppliers, useSaveSupplier,
  type PlanningWarehouse, type PlanningSupplier, type WarehouseRole, type PlanningUse,
} from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import Badge from '../ui/Badge';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary } from './ui-helpers';

const ROLE_LABEL: Record<WarehouseRole, string> = {
  sellable: 'Vendible (e-commerce y bodega)', store: 'Tienda física', workshop: 'Taller', raw: 'Materia prima', reserved: 'Apartado', project: 'Facturación proyectos',
};
const USE_LABEL: Record<PlanningUse, string> = { purchase: 'compras', production: 'producción', store: 'tienda' };

/**
 * Warehouses with the role each plays (D5) and the suppliers whose terms
 * items inherit. Both are small tables edited in place.
 */
export default function MastersTab() {
  const can = useAuthStore((s) => s.can);
  const { data: warehouses } = usePlanningWarehouses();
  const { data: suppliers } = useSuppliers();
  const updateWarehouse = useUpdateWarehouse();
  const [editingSupplier, setEditingSupplier] = useState<PlanningSupplier | 'new' | null>(null);

  const setRole = async (w: PlanningWarehouse, role: WarehouseRole) => {
    try {
      await updateWarehouse.mutateAsync({ id: w._id, data: { role } });
      toast.success(`${w.name}: ${ROLE_LABEL[role]}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };
  const toggleUse = async (w: PlanningWarehouse, use: PlanningUse) => {
    const countsFor = w.countsFor.includes(use) ? w.countsFor.filter((u) => u !== use) : [...w.countsFor, use];
    try {
      await updateWarehouse.mutateAsync({ id: w._id, data: { countsFor } });
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Bodegas y su rol</h3>
          <p className="text-xs text-text-muted">Cada decisión lee solo las bodegas marcadas para ella. Compras: producto terminado vendible. Producción: talleres y materia prima. Tienda: origen y destino de la reposición.</p>
        </div>
        <TableShell headers={['Bodega', 'Rol', 'Cuenta para', 'Estado', 'Nota']}>
          {warehouses?.map((w) => (
            <tr key={w._id} className="border-b border-border-secondary">
              <td className="px-3 py-2 text-text-primary">{w.name}</td>
              <td className="px-3 py-2">
                {can('admin') ? (
                  <select value={w.role} onChange={(e) => setRole(w, e.target.value as WarehouseRole)} className={selectCls}>
                    {(Object.keys(ROLE_LABEL) as WarehouseRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                ) : ROLE_LABEL[w.role]}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(USE_LABEL) as PlanningUse[]).map((u) => (
                    <label key={u} className={`flex items-center gap-1 text-xs ${can('admin') ? 'cursor-pointer' : ''} ${w.countsFor.includes(u) ? 'text-text-primary' : 'text-text-muted'}`}>
                      <input type="checkbox" checked={w.countsFor.includes(u)} disabled={!can('admin')} onChange={() => toggleUse(w, u)} className="accent-brand-blue" />
                      {USE_LABEL[u]}
                    </label>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2"><Badge label={w.isActive ? 'activa' : 'inactiva'} variant={w.isActive ? 'green' : 'gray'} /></td>
              <td className="px-3 py-2 text-xs text-brand-amber">{w.notes}</td>
            </tr>
          ))}
        </TableShell>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Proveedores</h3>
            <p className="text-xs text-text-muted">Una ficha hereda lead time y tránsito de su proveedor mientras no tenga valor propio.</p>
          </div>
          {can('admin') && <button onClick={() => setEditingSupplier('new')} className={btnPrimary}>+ Proveedor</button>}
        </div>
        {editingSupplier && <SupplierForm supplier={editingSupplier === 'new' ? null : editingSupplier} onClose={() => setEditingSupplier(null)} />}
        <TableShell headers={['Proveedor', 'Moneda', 'Lead time', 'Tránsito', 'Cadencia', 'Mín. pedido', 'Alcance MOQ', 'Factor desemb.', '']}>
          {suppliers?.length === 0 && <Empty colSpan={9} text="Sin proveedores" />}
          {suppliers?.map((s) => (
            <tr key={s._id} className={`border-b border-border-secondary ${s.isActive ? '' : 'opacity-50'}`}>
              <td className="px-3 py-2 text-text-primary">{s.name}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{s.currency}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{s.leadTimeDays} d</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{s.transitDays} d</td>
              <td className="px-3 py-2 text-xs text-text-secondary">cada {s.cadenceDays} d</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{s.containerMin ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">{s.moqScope}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">×{s.landedFactor}</td>
              <td className="px-3 py-2 text-right">{can('admin') && <button onClick={() => setEditingSupplier(s)} className={btnGhost}>Editar</button>}</td>
            </tr>
          ))}
        </TableShell>
      </section>
    </div>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: PlanningSupplier | null; onClose: () => void }) {
  const mutation = useSaveSupplier();
  const [form, setForm] = useState({
    name: supplier?.name ?? '', currency: supplier?.currency ?? 'USD', leadTimeDays: supplier?.leadTimeDays ?? 30, transitDays: supplier?.transitDays ?? 50,
    cadenceDays: supplier?.cadenceDays ?? 90, containerMin: supplier?.containerMin ?? '', moqScope: supplier?.moqScope ?? 'sku', landedFactor: supplier?.landedFactor ?? 1,
    isActive: supplier?.isActive ?? true,
  });
  const set = (k: keyof typeof form, v: string | number | boolean) => setForm({ ...form, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({
        id: supplier?._id,
        data: {
          name: form.name, currency: form.currency, leadTimeDays: Number(form.leadTimeDays), transitDays: Number(form.transitDays),
          cadenceDays: Number(form.cadenceDays), containerMin: form.containerMin === '' ? null : Number(form.containerMin),
          moqScope: form.moqScope as PlanningSupplier['moqScope'], landedFactor: Number(form.landedFactor), isActive: form.isActive,
        },
      });
      toast.success(supplier ? 'Proveedor actualizado' : 'Proveedor creado');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="text-xs text-text-muted">{label}<span className="block mt-1">{node}</span></label>
  );

  return (
    <form onSubmit={submit} className="bg-bg-secondary border border-border-primary rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
      {field('Nombre', <input value={form.name} onChange={(e) => set('name', e.target.value)} required disabled={!!supplier} className={`${inputCls} w-full`} />)}
      {field('Moneda', <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={`${selectCls} w-full`}><option>USD</option><option>EUR</option><option>CLP</option></select>)}
      {field('Lead time (d)', <input type="number" min={0} value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} className={`${inputCls} w-full`} />)}
      {field('Tránsito (d)', <input type="number" min={0} value={form.transitDays} onChange={(e) => set('transitDays', e.target.value)} className={`${inputCls} w-full`} />)}
      {field('Cadencia (d)', <input type="number" min={1} value={form.cadenceDays} onChange={(e) => set('cadenceDays', e.target.value)} className={`${inputCls} w-full`} />)}
      {field('Mín. pedido', <input type="number" min={0} value={form.containerMin} onChange={(e) => set('containerMin', e.target.value)} placeholder="—" className={`${inputCls} w-full`} />)}
      {field('Alcance MOQ', <select value={form.moqScope} onChange={(e) => set('moqScope', e.target.value)} className={`${selectCls} w-full`}><option value="sku">por SKU</option><option value="family">por familia</option><option value="order">por pedido</option></select>)}
      {field('Factor desemb.', <input type="number" min={1} step="0.01" value={form.landedFactor} onChange={(e) => set('landedFactor', e.target.value)} className={`${inputCls} w-full`} />)}
      <div className="col-span-2 md:col-span-4 lg:col-span-8 flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="accent-brand-blue" /> Activo</label>
        <span className="flex-1" />
        <button type="submit" disabled={mutation.isPending} className={btnPrimary}>Guardar</button>
        <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
      </div>
    </form>
  );
}
