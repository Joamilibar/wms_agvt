import { useState } from 'react';
import toast from 'react-hot-toast';
import { useRecipes, useSaveRecipe, useDeactivateRecipe, type BomRecipe, type Uom } from '../../hooks/useApi';
import { useAuthStore } from '../../stores/auth.store';
import { getErrorMessage } from '../../lib/errors';
import { confirmDialog } from '../../lib/confirm';
import Badge from '../ui/Badge';
import LoadingSpinner from '../ui/LoadingSpinner';
import { TableShell, Empty } from './ui';
import { inputCls, selectCls, btnGhost, btnPrimary } from './ui-helpers';

type Draft = { parentSku: string; name: string; notes: string; components: { sku: string; name: string; qty: string; uom: Uom; scrapPct: string }[] };
const emptyDraft = (): Draft => ({ parentSku: '', name: '', notes: '', components: [{ sku: '', name: '', qty: '1', uom: 'un', scrapPct: '' }] });
const fromRecipe = (r: BomRecipe): Draft => ({ parentSku: r.parentSku, name: r.name, notes: r.notes, components: r.components.map((c) => ({ sku: c.sku, name: c.name, qty: String(c.qty), uom: c.uom, scrapPct: c.scrapPct === null ? '' : String(c.scrapPct) })) });

/**
 * Recipes in physical units (pieces, kilos, metres). Saving a change
 * creates a new version; the old one stays for the orders made with it.
 */
export default function RecipesTab() {
  const can = useAuthStore((s) => s.can);
  const { data: recipes, isLoading } = useRecipes();
  const save = useSaveRecipe();
  const deactivate = useDeactivateRecipe();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const rows = (recipes ?? []).filter((r) => { const q = search.toLowerCase(); return !q || r.parentSku.includes(q) || r.name.toLowerCase().includes(q) || r.components.some((c) => c.sku.includes(q) || c.name.toLowerCase().includes(q)); });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const components = draft.components.filter((c) => c.sku.trim()).map((c) => ({ sku: c.sku.trim(), qty: Number(c.qty), uom: c.uom, scrapPct: c.scrapPct === '' ? null : Number(c.scrapPct) }));
    if (!draft.parentSku.trim() || components.length === 0) { toast.error('Falta el SKU del producto o los componentes'); return; }
    try {
      const r = await save.mutateAsync({ parentSku: draft.parentSku.trim(), name: draft.name, components, notes: draft.notes });
      toast.success(`Receta de ${r.parentSku} guardada (v${r.version})`);
      setDraft(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };
  const remove = async (r: BomRecipe) => {
    if (!(await confirmDialog({ title: 'Desactivar receta', detail: `${r.name || r.parentSku} deja de explotarse; las versiones quedan guardadas.`, confirmLabel: 'Desactivar', danger: true }))) return;
    try { await deactivate.mutateAsync(r.parentSku); toast.success('Receta desactivada'); } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Producto, SKU o componente" className={`${inputCls} w-64`} />
        <span className="text-xs text-text-muted">{rows.length} recetas activas · cantidades por unidad de producto</span>
        <span className="flex-1" />
        {can('admin', 'supervisor') && <button onClick={() => setDraft(emptyDraft())} className={btnPrimary}>+ Receta</button>}
      </div>

      {draft && (
        <form onSubmit={submit} className="bg-bg-secondary border border-brand-blue/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-text-muted">SKU del producto<input value={draft.parentSku} onChange={(e) => setDraft({ ...draft, parentSku: e.target.value })} className={`${inputCls} block mt-1 w-full`} required /></label>
            <label className="text-xs text-text-muted">Nombre<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${inputCls} block mt-1 w-full`} /></label>
            <label className="text-xs text-text-muted">Nota<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={`${inputCls} block mt-1 w-full`} /></label>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-text-muted uppercase tracking-wider"><th className="px-2 py-1 text-left">Componente (SKU)</th><th className="px-2 py-1 text-left">Cantidad</th><th className="px-2 py-1 text-left">Unidad</th><th className="px-2 py-1 text-left">Merma (vacío = global)</th><th /></tr></thead>
            <tbody>
              {draft.components.map((c, i) => (
                <tr key={i}>
                  <td className="px-2 py-1"><input value={c.sku} onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, j) => j === i ? { ...x, sku: e.target.value } : x) })} className={`${inputCls} w-48`} placeholder="SKU" /></td>
                  <td className="px-2 py-1"><input type="number" min={0} step="0.001" value={c.qty} onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} className={`${inputCls} w-24`} /></td>
                  <td className="px-2 py-1"><select value={c.uom} onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, j) => j === i ? { ...x, uom: e.target.value as Uom } : x) })} className={selectCls}><option value="un">un</option><option value="kg">kg</option><option value="m">m</option></select></td>
                  <td className="px-2 py-1"><input type="number" min={0} step="0.01" value={c.scrapPct} onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, j) => j === i ? { ...x, scrapPct: e.target.value } : x) })} className={`${inputCls} w-20`} placeholder="0.03" /></td>
                  <td className="px-2 py-1"><button type="button" onClick={() => setDraft({ ...draft, components: draft.components.filter((_, j) => j !== i) })} className={btnGhost}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft({ ...draft, components: [...draft.components, { sku: '', name: '', qty: '1', uom: 'un', scrapPct: '' }] })} className={btnGhost}>+ Componente</button>
            <span className="flex-1" />
            <button type="submit" disabled={save.isPending} className={btnPrimary}>Guardar</button>
            <button type="button" onClick={() => setDraft(null)} className={btnGhost}>Cancelar</button>
          </div>
        </form>
      )}

      <TableShell headers={['Producto', 'SKU', 'v', 'Componentes', 'Nota', '']}>
        {rows.length === 0 && <Empty colSpan={6} text="Sin recetas" />}
        {rows.map((r) => (
          <tr key={r._id} className="border-b border-border-secondary align-top">
            <td className="px-3 py-2 text-xs text-text-primary">{r.name || '—'}</td>
            <td className="px-3 py-2 font-mono text-xs text-brand-blue">{r.parentSku}</td>
            <td className="px-3 py-2 text-xs text-text-muted">{r.version}</td>
            <td className="px-3 py-2 text-xs text-text-secondary">
              {r.components.map((c) => (
                <div key={c.sku} className="flex gap-2"><span className="font-mono text-[11px] text-text-muted">{c.sku}</span><span>{c.name || '—'}</span><Badge label={`${c.qty} ${c.uom}`} variant={c.uom === 'kg' ? 'purple' : 'gray'} /></div>
              ))}
            </td>
            <td className="px-3 py-2 text-[11px] text-text-muted max-w-[260px]">{r.notes}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {can('admin', 'supervisor') && <button onClick={() => setDraft(fromRecipe(r))} className={btnGhost}>Editar</button>}
              {can('admin', 'supervisor') && <button onClick={() => remove(r)} className={`${btnGhost} ml-1`}>Desactivar</button>}
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}
