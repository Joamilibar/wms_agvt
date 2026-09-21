import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import toast from 'react-hot-toast';
import {
  useBlockCatalogue, useSheetingModelsAll, useSheetingModelPreview, useSaveSheetingModel, useDuplicateSheetingModel, useFabrics,
  type BlockDef, type BlockRef, type SheetingModel, type SheetingModelInput, type SheetingPreviewInput,
} from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuthStore } from '../stores/auth.store';
import { getErrorDetails, getErrorMessage } from '../lib/errors';
import { confirmDialog } from '../lib/confirm';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Badge from '../components/ui/Badge';
import { TableShell, Empty } from '../components/Planning/ui';
import { inputCls, selectCls, btnGhost, btnPrimary, fmtClp } from '../components/Planning/ui-helpers';
import { RollLayout } from '../components/Sheeting/RollLayout';

const FAMILIES = ['encimera', 'bajera', 'funda', 'cubreplumon', 'otro'] as const;
const FAMILY_LABEL: Record<string, string> = { encimera: 'Encimera', bajera: 'Bajera', funda: 'Funda', cubreplumon: 'Cubreplumón', otro: 'Otro' };

interface Draft {
  code: string; name: string; family: SheetingModel['family']; blocks: BlockRef[]; vars: Record<string, number>;
  sampleVars: Record<string, number>; cutBatchUnits: number; packagingClp: number; freightClp: number; notes: string;
  fabricSku: string; frameFabricSku: string; sizeLabel: string;
}

const emptyDraft = (): Draft => ({
  code: '', name: '', family: 'encimera', blocks: [{ block: 'panel_simple', params: {} }], vars: { s: 2 },
  sampleVars: { A: 255, L: 290, H: 35 }, cutBatchUnits: 20, packagingClp: 0, freightClp: 0, notes: '', fabricSku: '', frameFabricSku: '', sizeLabel: 'Queen',
});
const fromModel = (m: SheetingModel, code = m.code): Draft => ({
  code, name: m.name, family: m.family, blocks: m.blocks?.length ? m.blocks.map((b) => ({ block: b.block, params: { ...b.params } })) : [],
  vars: { ...m.vars }, sampleVars: { A: 255, L: 290, H: 35, ...m.sampleVars }, cutBatchUnits: m.cutBatchUnits, packagingClp: m.packagingClp ?? 0, freightClp: m.freightClp ?? 0,
  notes: m.notes, fabricSku: '', frameFabricSku: '', sizeLabel: 'Queen',
});

/**
 * The model builder (phase-4 of the sheeting spec). A model is an ordered
 * list of blocks; the right side previews — via POST /models/preview, with
 * debounce and nothing persisted — the panels for a sample size, the lay-up
 * on the roll, metres, orientation, waste and cost, so moving a frame from
 * 15 to 20 cm is seen in metres and pesos before saving. Saving writes a
 * new version; the usual path is duplicate-and-edit.
 */
export default function ModelosSabaneria() {
  const can = useAuthStore((s) => s.can);
  const { data: models, isLoading } = useSheetingModelsAll();
  const { data: catalogue } = useBlockCatalogue();
  const { data: fabrics } = useFabrics();
  const save = useSaveSheetingModel();
  const duplicate = useDuplicateSheetingModel();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveProblems, setSaveProblems] = useState<{ role: string; axis: string; valueCm: number; expression: string }[]>([]);

  const active = useMemo(() => (models ?? []).filter((m) => m.isActive), [models]);
  const versionsOf = (code: string) => (models ?? []).filter((m) => m.code === code).length;

  const previewInput = useMemo<SheetingPreviewInput | null>(() => {
    if (!draft || draft.blocks.length === 0) return null;
    const { fabricSku, frameFabricSku, sizeLabel, ...rest } = draft;
    return { ...rest, code: draft.code || 'BORRADOR', name: draft.name || 'Borrador', fabricSku: fabricSku || undefined, frameFabricSku: frameFabricSku || undefined, sizeLabel: sizeLabel || undefined };
  }, [draft]);
  const preview = useSheetingModelPreview(useDebouncedValue(previewInput, 400));

  const submit = async () => {
    if (!draft) return;
    if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(draft.code)) { toast.error('Código: mayúsculas, números y guión bajo (ej. FUNDA_LINO_MARCO)'); return; }
    if (!draft.name.trim()) { toast.error('Ponle nombre al modelo'); return; }
    const exists = versionsOf(draft.code) > 0;
    if (!(await confirmDialog({ title: exists ? `Nueva versión de ${draft.code}` : `Crear ${draft.code}`, detail: exists ? 'La versión vigente deja de estar activa; las cotizaciones y recetas que la usaron no cambian.' : 'Los bloques se compilan a paneles y quedan guardados así.', confirmLabel: 'Guardar' }))) return;
    const { fabricSku, frameFabricSku, sizeLabel, ...rest } = draft;
    void fabricSku; void frameFabricSku; void sizeLabel;
    const body: SheetingModelInput = { ...rest };
    try {
      const m = await save.mutateAsync(body);
      toast.success(`${m.code} v${m.version} guardado`);
      setSaveProblems([]);
      setDraft(null);
    } catch (e) {
      const d = getErrorDetails<{ role: string; axis: string; valueCm: number; expression: string }[]>(e);
      if (Array.isArray(d)) setSaveProblems(d);
      toast.error(getErrorMessage(e));
    }
  };

  const dup = async (m: SheetingModel) => {
    const code = `${m.code}_COPIA`;
    if (!(await confirmDialog({ title: `Duplicar ${m.code}`, detail: `Se crea ${code} v1 con los mismos bloques, listo para editar.`, confirmLabel: 'Duplicar' }))) return;
    try {
      const created = await duplicate.mutateAsync({ code: m.code, newCode: code });
      toast.success(`${created.code} creado`);
      setDraft(fromModel(created));
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (isLoading || !catalogue) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Modelos de sabanería</h1>
          <p className="text-sm text-text-muted mt-1">Cada modelo es una lista de bloques; se compila a paneles al guardar y de ahí lee el <Link to="/cotizador" className="text-brand-blue hover:underline">cotizador</Link>.</p>
        </div>
        <span className="flex-1" />
        {can('admin') && !draft && <button onClick={() => setDraft(emptyDraft())} className={btnPrimary}>Nuevo modelo</button>}
      </div>

      {draft && (
        <Editor draft={draft} onChange={setDraft} catalogue={catalogue} fabrics={fabrics ?? []} preview={preview.data ?? null} previewing={preview.isFetching}
          previewError={preview.error ? getErrorMessage(preview.error) : null} saveProblems={saveProblems} onSave={submit} onCancel={() => { setDraft(null); setSaveProblems([]); }} saving={save.isPending} canSave={can('admin')} />
      )}

      <TableShell headers={['Código', 'Nombre', 'Familia', 'Versión', 'Paneles', 'Bloques', 'Actualizado', '']}>
        {active.length === 0 && <Empty colSpan={8} text="Sin modelos. Carga los de referencia desde Planificación o crea uno." />}
        {active.map((m) => (
          <tr key={m._id} className="border-b border-border-secondary">
            <td className="px-3 py-2 font-mono text-xs text-brand-blue">{m.code}</td>
            <td className="px-3 py-2 text-xs text-text-primary">{m.name}</td>
            <td className="px-3 py-2"><Badge label={FAMILY_LABEL[m.family] ?? m.family} variant="gray" /></td>
            <td className="px-3 py-2 text-xs text-text-secondary">v{m.version}{versionsOf(m.code) > 1 ? <span className="text-text-muted"> de {versionsOf(m.code)}</span> : ''}</td>
            <td className="px-3 py-2 text-xs text-text-secondary">{m.panels.length}</td>
            <td className="px-3 py-2 text-xs text-text-muted">{m.blocks?.length ? m.blocks.map((b) => b.block).join(' + ') : <span className="italic">a mano</span>}</td>
            <td className="px-3 py-2 text-xs text-text-muted">{m.updatedAt?.slice(0, 10)}{m.setBy ? ` · ${m.setBy}` : ''}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {can('admin', 'supervisor') && <button onClick={() => { setDraft(fromModel(m)); setSaveProblems([]); }} className={`${btnGhost} mr-1`}>{can('admin') ? 'Editar' : 'Ver'}</button>}
              {can('admin') && <button onClick={() => dup(m)} className={btnGhost}>Duplicar</button>}
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}

function Editor({ draft, onChange, catalogue, fabrics, preview, previewing, previewError, saveProblems, onSave, onCancel, saving, canSave }: {
  draft: Draft; onChange: (d: Draft) => void; catalogue: BlockDef[]; fabrics: { sku: string; name: string; rollWidthCm: number }[];
  preview: ReturnType<typeof useSheetingModelPreview>['data'] | null; previewing: boolean; previewError: string | null;
  saveProblems: { role: string; axis: string; valueCm: number; expression: string }[]; onSave: () => void; onCancel: () => void; saving: boolean; canSave: boolean;
}) {
  const [adding, setAdding] = useState(catalogue[1]?.name ?? '');
  const setBlock = (i: number, params: BlockRef['params']) => onChange({ ...draft, blocks: draft.blocks.map((b, j) => (j === i ? { ...b, params } : b)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    onChange({ ...draft, blocks });
  };
  const addBlock = () => {
    const def = catalogue.find((b) => b.name === adding);
    if (!def) return;
    const params: BlockRef['params'] = {};
    for (const p of def.params) if (p.default !== undefined) params[p.name] = p.default;
    onChange({ ...draft, blocks: [...draft.blocks, { block: def.name, params }] });
  };
  const problems = preview?.problems?.length ? preview.problems : saveProblems;
  const needsH = preview?.panels.some((p) => [...p.width.terms, ...p.length.terms].some((t) => t.var === 'H')) ?? false;
  const usesS = preview?.panels.some((p) => [...p.width.terms, ...p.length.terms].some((t) => t.var === 's')) ?? true;
  const q = preview?.quote ?? null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div className="bg-bg-secondary border border-border-primary rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-text-muted">Código<input value={draft.code} onChange={(e) => onChange({ ...draft, code: e.target.value.toUpperCase() })} className={`${inputCls} w-full mt-1 font-mono`} placeholder="FUNDA_LINO_MARCO" /></label>
          <label className="text-xs text-text-muted sm:col-span-2">Nombre<input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} className={`${inputCls} w-full mt-1`} placeholder="Funda de almohada lino con marco" /></label>
          <label className="text-xs text-text-muted">Familia
            <select value={draft.family} onChange={(e) => onChange({ ...draft, family: e.target.value as Draft['family'] })} className={`${selectCls} w-full mt-1`}>
              {FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">Lote de corte (u.)<input type="number" min={1} value={draft.cutBatchUnits} onChange={(e) => onChange({ ...draft, cutBatchUnits: Number(e.target.value) })} className={`${inputCls} w-full mt-1`} /></label>
          {usesS && <label className="text-xs text-text-muted">s · margen por borde (cm)<input type="number" step={0.5} value={draft.vars.s ?? 2} onChange={(e) => onChange({ ...draft, vars: { ...draft.vars, s: Number(e.target.value) } })} className={`${inputCls} w-full mt-1`} /></label>}
          <label className="text-xs text-text-muted">Empaque (CLP/u.)<input type="number" min={0} value={draft.packagingClp} onChange={(e) => onChange({ ...draft, packagingClp: Number(e.target.value) })} className={`${inputCls} w-full mt-1`} /></label>
          <label className="text-xs text-text-muted">Traslado (CLP/u.)<input type="number" min={0} value={draft.freightClp} onChange={(e) => onChange({ ...draft, freightClp: Number(e.target.value) })} className={`${inputCls} w-full mt-1`} /></label>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">Bloques, en orden</h3>
          {draft.blocks.map((b, i) => {
            const def = catalogue.find((c) => c.name === b.block);
            return (
              <div key={i} className="rounded-lg border border-border-secondary bg-bg-tertiary/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">{i + 1}. {def?.label ?? b.block}</span>
                  <span className="text-[11px] text-text-muted flex-1 truncate" title={def?.description}>{def?.description}</span>
                  <button onClick={() => move(i, -1)} className={btnGhost} disabled={i === 0}>↑</button>
                  <button onClick={() => move(i, 1)} className={btnGhost} disabled={i === draft.blocks.length - 1}>↓</button>
                  <button onClick={() => onChange({ ...draft, blocks: draft.blocks.filter((_, j) => j !== i) })} className={`${btnGhost} text-brand-red`}>×</button>
                </div>
                {def && def.params.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {def.params.map((p) => (
                      <label key={p.name} className="text-[11px] text-text-muted" title={p.hint}>
                        {p.label}{p.unit ? ` (${p.unit})` : ''}
                        {p.type === 'boolean' ? (
                          <div className="mt-1"><input type="checkbox" checked={b.params[p.name] === true || b.params[p.name] === 'true' || (b.params[p.name] === undefined && p.default === true)} onChange={(e) => setBlock(i, { ...b.params, [p.name]: e.target.checked })} /></div>
                        ) : (
                          <input type={p.type === 'number' ? 'number' : 'text'} step={0.5} value={b.params[p.name] === undefined ? String(p.default ?? '') : String(b.params[p.name])}
                            onChange={(e) => setBlock(i, { ...b.params, [p.name]: p.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} className={`${inputCls} w-full mt-1`} />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex gap-2">
            <select value={adding} onChange={(e) => setAdding(e.target.value)} className={selectCls}>
              {catalogue.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
            </select>
            <button onClick={addBlock} className={btnGhost}>+ agregar bloque</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-text-muted">Muestra A (cm)<input type="number" value={draft.sampleVars.A ?? ''} onChange={(e) => onChange({ ...draft, sampleVars: { ...draft.sampleVars, A: Number(e.target.value) } })} className={`${inputCls} w-full mt-1`} /></label>
          <label className="text-xs text-text-muted">Muestra L (cm)<input type="number" value={draft.sampleVars.L ?? ''} onChange={(e) => onChange({ ...draft, sampleVars: { ...draft.sampleVars, L: Number(e.target.value) } })} className={`${inputCls} w-full mt-1`} /></label>
          {needsH && <label className="text-xs text-text-muted">Muestra H (cm)<input type="number" value={draft.sampleVars.H ?? ''} onChange={(e) => onChange({ ...draft, sampleVars: { ...draft.sampleVars, H: Number(e.target.value) } })} className={`${inputCls} w-full mt-1`} /></label>}
          <label className="text-xs text-text-muted">Tela (vista previa)
            <select value={draft.fabricSku} onChange={(e) => onChange({ ...draft, fabricSku: e.target.value })} className={`${selectCls} w-full mt-1`}>
              <option value="">Primera activa</option>
              {fabrics.map((f) => <option key={f.sku} value={f.sku}>{f.name} · {f.rollWidthCm}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">Talla (tarifa, vista previa)
            <select value={draft.sizeLabel} onChange={(e) => onChange({ ...draft, sizeLabel: e.target.value })} className={`${selectCls} w-full mt-1`}>
              <option value="">Sin talla</option>
              {['Single', 'Twin', 'Full', 'Queen', 'King', 'SuperKing'].map((sz) => <option key={sz} value={sz}>{sz}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">Tela del marco (vista previa)
            <select value={draft.frameFabricSku} onChange={(e) => onChange({ ...draft, frameFabricSku: e.target.value })} className={`${selectCls} w-full mt-1`}>
              <option value="">Misma</option>
              {fabrics.map((f) => <option key={f.sku} value={f.sku}>{f.name} · {f.rollWidthCm}</option>)}
            </select>
          </label>
        </div>
        <textarea value={draft.notes} onChange={(e) => onChange({ ...draft, notes: e.target.value })} className={`${inputCls} w-full h-16`} placeholder="Notas: cómo se confecciona, qué confirmó el taller" />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className={btnGhost}>Cerrar</button>
          {canSave && <button onClick={onSave} disabled={saving || problems.length > 0} className={btnPrimary}>Guardar versión</button>}
        </div>
      </div>

      <div className="space-y-3">
        {previewError && <p className="text-sm text-brand-red">{previewError}</p>}
        {problems.length > 0 && (
          <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 p-4 space-y-1">
            <p className="text-sm font-semibold text-brand-red">Geometría imposible con estas medidas</p>
            {problems.map((p, i) => <p key={i} className="text-xs text-text-primary">El panel <span className="font-mono">{p.role}</span> queda con {p.axis === 'width' ? 'ancho' : 'largo'} <span className="font-semibold">{p.valueCm} cm</span> ({p.expression}).</p>)}
          </div>
        )}
        {preview && (
          <div className={`bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3 ${previewing ? 'opacity-60' : ''}`}>
            <h3 className="text-sm font-semibold text-text-primary">Paneles resultantes</h3>
            <table className="text-xs w-full">
              <thead><tr className="text-text-muted"><th className="text-left py-1">Pieza</th><th className="text-left py-1">Expresión</th><th className="text-right py-1">Muestra</th><th className="text-left py-1 pl-2">Tela</th></tr></thead>
              <tbody>
                {preview.panelsText.map((p, i) => {
                  const cut = preview.cut?.[i];
                  return (
                    <tr key={p.role} className="border-t border-border-secondary">
                      <td className="py-1 text-text-primary">{p.count}× {p.role}{p.mitred45 ? <span className="text-text-muted"> · 45°</span> : ''}</td>
                      <td className="py-1 font-mono text-text-secondary">{p.width} × {p.length}</td>
                      <td className="py-1 text-right font-mono text-text-secondary">{cut ? `${cut.widthCm} × ${cut.lengthCm}` : '—'}</td>
                      <td className="py-1 pl-2 text-text-muted">{preview.panels[i]?.fabricSlot ?? 'base'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-text-muted">Variables: {Object.entries({ ...draft.vars, ...preview.vars }).map(([k, v]) => `${k} = ${v}`).join(' · ')}</p>
          </div>
        )}
        {q && (
          <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-[11px] text-text-muted uppercase">Metros/u.</p><p className="text-lg font-bold text-text-primary">{q.consumption.linearMetresPerUnit.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m</p></div>
              <div><p className="text-[11px] text-text-muted uppercase">Merma</p><p className={`text-lg font-bold ${q.consumption.wastePct > 0.25 ? 'text-brand-amber' : 'text-text-primary'}`}>{(q.consumption.wastePct * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %</p></div>
              <div><p className="text-[11px] text-text-muted uppercase">Costo/u.</p><p className="text-lg font-bold text-text-primary">{fmtClp(q.cost.total)}</p></div>
            </div>
            {q.fabrics.map((f) => (
              <div key={f.slot} className="space-y-1">
                <p className="text-xs text-text-secondary"><Badge label={f.slot === 'base' ? 'Centro' : 'Marco'} variant={f.slot === 'base' ? 'blue' : 'purple'} /> {f.name} · {f.rollWidthCm} cm · {f.consumption.linearMetresPerUnit.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m/u · {q.pieces.filter((p) => p.fabricSlot === f.slot).map((p) => `${p.role} ${p.orientation === 'al_hilo' ? 'al hilo' : 'contrahilo'} ×${p.piecesAcross}`).join(' · ')}</p>
                <RollLayout rollWidthCm={f.rollWidthCm} usableWidthCm={f.usableWidthCm} pieces={q.pieces.filter((p) => p.fabricSlot === f.slot)} />
              </div>
            ))}
            <p className="text-[11px] text-text-muted">Tela {fmtClp(q.cost.fabric)} · taller {fmtClp(q.cost.labour)} · empaque {fmtClp(q.cost.packaging)} · traslado {fmtClp(q.cost.freight)} — {q.workshop}</p>
          </div>
        )}
        {preview && !q && preview.quoteError && problems.length === 0 && (
          <p className="text-xs text-brand-amber">Encaje listo; sin costo: {preview.quoteError.code === 'NO_WORKSHOP_RATE' ? `el taller no tiene tarifa para ${preview.quoteError.modelCode ?? 'este modelo'}${preview.quoteError.sizeLabel ? ` ${preview.quoteError.sizeLabel}` : ''}${preview.quoteError.quality ? ` en ${preview.quoteError.quality}` : ''} (las tarifas de la hoja son por talla)` : preview.quoteError.code === 'FABRIC_TOO_NARROW' ? `la pieza ${preview.quoteError.role} necesita ${preview.quoteError.requiredWidthCm} cm y el rollo da ${preview.quoteError.availableWidthCm}` : preview.quoteError.code}.</p>
        )}
      </div>
    </div>
  );
}
