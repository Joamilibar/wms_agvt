import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useAuthStore } from '../stores/auth.store';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useFabrics, useSheetingModels, useSheetingQuote, usePlanningWarehouses,
  type SheetingModel, type SheetingQuote, type SheetingQuoteError, type SheetingQuoteInput,
} from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getErrorDetails, getErrorMessage } from '../lib/errors';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Badge from '../components/ui/Badge';
import { inputCls, selectCls, fmtClp } from '../components/Planning/ui-helpers';
import { RollLayout } from '../components/Sheeting/RollLayout';

const SIZES = ['Single', 'Twin', 'Full', 'Queen', 'King', 'SuperKing'] as const;
const CHANNELS = [{ value: 'tienda', label: 'Tienda' }, { value: 'hoteleria', label: 'Hotelería' }] as const;

const schema = z.object({
  modelCode: z.string().min(1, 'Elige un modelo'),
  fabricSku: z.string().min(1, 'Elige una tela'),
  frameFabricSku: z.string(),
  A: z.number().positive('Ancho en cm'),
  L: z.number().positive('Largo en cm'),
  H: z.number().min(0),
  qty: z.number().int().min(1, 'Al menos 1'),
  workshop: z.string().min(1, 'Elige un taller'),
  channel: z.string().min(1),
  sizeLabel: z.string(),
});
type Form = z.infer<typeof schema>;

const fmtM = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const fmtPct = (n: number) => `${(n * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`;
const ORIENTATION = { al_hilo: 'al hilo', contrahilo: 'contrahilo' } as const;

/**
 * Fabric consumption and quote for sheeting. The form recalculates against
 * `POST /planning/sheeting/quote` (idempotent, nothing persisted) while the
 * user types; the result leads with the number the supplier is asked for —
 * linear metres — and keeps the sheet's area-based figure only as a grey
 * reference, because that is where the two costings part ways.
 */
export default function Cotizador() {
  const { data: models, isLoading: lm } = useSheetingModels();
  const { data: fabrics, isLoading: lf } = useFabrics();
  const { data: warehouses } = usePlanningWarehouses();
  const can = useAuthStore((s) => s.can);
  const workshops = useMemo(() => (warehouses ?? []).filter((w) => w.role === 'workshop' && w.isActive), [warehouses]);

  const { register, control, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { modelCode: '', fabricSku: '', frameFabricSku: '', A: 255, L: 290, H: 35, qty: 20, workshop: '', channel: 'tienda', sizeLabel: 'Queen' },
  });
  const values = useWatch({ control });
  const model = models?.find((m) => m.code === values.modelCode) ?? models?.[0];

  // The selects start empty until the masters arrive: pick the first of each so the form shows what is quoted.
  useEffect(() => { if (!values.modelCode && models?.[0]) setValue('modelCode', models[0].code); }, [models, values.modelCode, setValue]);
  useEffect(() => { if (!values.fabricSku && fabrics?.[0]) setValue('fabricSku', fabrics[0].sku); }, [fabrics, values.fabricSku, setValue]);
  useEffect(() => { if (!values.workshop && workshops[0]) setValue('workshop', workshops[0].name); }, [workshops, values.workshop, setValue]);
  // A new model brings its own sample measures (a fitted sheet takes the mattress, a top sheet the finished size).
  const modelCode = model?.code;
  const sample = model?.sampleVars;
  useEffect(() => {
    if (!sample) return;
    if (sample.A !== undefined) setValue('A', sample.A);
    if (sample.L !== undefined) setValue('L', sample.L);
    if (sample.H !== undefined) setValue('H', sample.H);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the model changes, not on every sample object identity
  }, [modelCode, setValue]);
  const needsH = !!model && model.panels.some((p) => [...p.width.terms, ...p.length.terms].some((t) => t.var === 'H'));
  const hasFrame = !!model && model.panels.some((p) => p.fabricSlot === 'marco');

  const input = useMemo<SheetingQuoteInput | null>(() => {
    const modelCode = values.modelCode || model?.code;
    const fabricSku = values.fabricSku || fabrics?.[0]?.sku;
    const workshop = values.workshop || workshops[0]?.name;
    if (!modelCode || !fabricSku || !workshop || !values.A || !values.L || !values.qty) return null;
    const measures: Record<string, number> = { A: Number(values.A), L: Number(values.L) };
    if (needsH) measures.H = Number(values.H);
    return {
      modelCode, fabricSku, frameFabricSku: hasFrame && values.frameFabricSku ? values.frameFabricSku : undefined,
      measures, qty: Number(values.qty), workshop, channel: values.channel ?? 'tienda', sizeLabel: values.sizeLabel || undefined,
    };
  }, [values, model?.code, fabrics, workshops, needsH, hasFrame]);
  const debounced = useDebouncedValue(input, 350);
  const quote = useSheetingQuote(debounced);
  const details = quote.error ? getErrorDetails<SheetingQuoteError>(quote.error) : null;

  if (lm || lf) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cotizador de sabanería</h1>
          <p className="text-sm text-text-muted mt-1">Metros lineales, orientación del corte, merma y costo desglosado. La tela se cotiza como se compra: por metro de rollo, no por área.</p>
        </div>
        <span className="flex-1" />
        {can('admin', 'supervisor') && <Link to="/cotizador/modelos" className="px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-xs text-text-secondary hover:bg-bg-tertiary">Modelos y constructor</Link>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form className="bg-bg-secondary border border-border-primary rounded-xl p-5 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Field label="Modelo" error={errors.modelCode?.message}>
            <select {...register('modelCode')} className={`${selectCls} w-full`}>
              {(models ?? []).map((m) => <option key={m.code} value={m.code}>{m.name} · v{m.version}</option>)}
            </select>
          </Field>
          {model && <ModelSummary model={model} />}

          <Field label="Tela del centro" error={errors.fabricSku?.message}>
            <select {...register('fabricSku')} className={`${selectCls} w-full`}>
              {(fabrics ?? []).map((f) => <option key={f.sku} value={f.sku}>{f.name} · {f.rollWidthCm} cm</option>)}
            </select>
          </Field>
          {hasFrame && (
            <Field label="Tela del marco" hint="Vacío = la misma del centro. Un marco de color se corta y se costea en su tela.">
              <select {...register('frameFabricSku')} className={`${selectCls} w-full`}>
                <option value="">Misma que el centro</option>
                {(fabrics ?? []).map((f) => <option key={f.sku} value={f.sku}>{f.name} · {f.rollWidthCm} cm</option>)}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label={model?.family === 'bajera' ? 'Ancho colchón (cm)' : 'Ancho terminado (cm)'} error={errors.A?.message}>
              <input type="number" step={1} {...register('A', { valueAsNumber: true })} className={`${inputCls} w-full`} />
            </Field>
            <Field label={model?.family === 'bajera' ? 'Largo colchón (cm)' : 'Largo terminado (cm)'} error={errors.L?.message}>
              <input type="number" step={1} {...register('L', { valueAsNumber: true })} className={`${inputCls} w-full`} />
            </Field>
            {needsH && (
              <Field label="Altura colchón (cm)" error={errors.H?.message}>
                <input type="number" step={1} {...register('H', { valueAsNumber: true })} className={`${inputCls} w-full`} />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Talla (tarifa del taller)">
              <select {...register('sizeLabel')} className={`${selectCls} w-full`}>
                <option value="">Sin talla</option>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Cantidad" error={errors.qty?.message}>
              <input type="number" min={1} step={1} {...register('qty', { valueAsNumber: true })} className={`${inputCls} w-full`} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Taller" error={errors.workshop?.message}>
              <select {...register('workshop')} className={`${selectCls} w-full`}>
                {workshops.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Canal">
              <select {...register('channel')} className={`${selectCls} w-full`}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>
        </form>

        <div className="xl:col-span-2 space-y-4">
          {quote.isPending && !quote.data && input && <LoadingSpinner />}
          {quote.error && <QuoteError message={getErrorMessage(quote.error)} details={details} fabrics={fabrics ?? []} />}
          {quote.data && !quote.error && <QuoteResult q={quote.data} stale={quote.isFetching} />}
          {!input && <p className="text-sm text-text-muted">Completa modelo, tela, medidas y taller para cotizar.</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="text-[11px] text-text-muted">{hint}</span>}
      {error && <span className="text-[11px] text-brand-red">{error}</span>}
    </label>
  );
}

function ModelSummary({ model }: { model: SheetingModel }) {
  return (
    <div className="rounded-lg bg-bg-tertiary/60 border border-border-secondary p-3 text-[11px] text-text-muted space-y-1">
      <div className="flex flex-wrap gap-x-3">
        {Object.entries(model.vars).map(([k, v]) => <span key={k}><span className="font-mono text-text-secondary">{k}</span> = {v}</span>)}
        {Object.keys(model.vars).length === 0 && <span>Sin parámetros</span>}
      </div>
      <ul className="space-y-0.5">
        {model.panelsText.map((p) => (
          <li key={p.role} className="font-mono">
            <span className="text-text-secondary">{p.count}× {p.role}</span>: {p.width} × {p.length}{p.mitred45 ? ' · inglete 45°' : ''}
          </li>
        ))}
      </ul>
      {model.notes && <p className="font-sans">{model.notes}</p>}
    </div>
  );
}

function QuoteError({ message, details, fabrics }: { message: string; details: SheetingQuoteError | null; fabrics: { sku: string; name: string; rollWidthCm: number }[] }) {
  const alt = details?.alternatives ?? [];
  return (
    <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 p-5 space-y-2">
      <p className="text-sm font-semibold text-brand-red">{details?.code === 'FABRIC_TOO_NARROW' ? 'No cabe en el rollo' : details?.code === 'NO_WORKSHOP_RATE' ? 'Sin tarifa de taller' : details?.code === 'NO_FABRIC_COST' ? 'La tela no tiene costo' : 'No se pudo cotizar'}</p>
      <p className="text-sm text-text-primary">{message}</p>
      {details?.code === 'FABRIC_TOO_NARROW' && (
        <p className="text-xs text-text-secondary">
          La pieza <span className="font-mono">{details.role}</span> necesita <span className="font-semibold">{details.requiredWidthCm} cm</span> de ancho útil; el rollo da {details.availableWidthCm}.
          {alt.length > 0
            ? <> Telas activas que sí la cubren: {alt.map((a) => `${fabrics.find((f) => f.sku === a.sku)?.name ?? a.name} (${a.rollWidthCm} cm)`).join(', ')}.</>
            : <> Ninguna tela activa la cubre: hace falta un rollo de al menos {(details.requiredWidthCm ?? 0) + 2} cm.</>}
        </p>
      )}
      {details?.code === 'NO_WORKSHOP_RATE' && <p className="text-xs text-text-secondary">Carga la tarifa en Planificación → Parámetros o elige otra talla/taller. Cero por defecto no es una cotización.</p>}
      {details?.code === 'NO_FABRIC_COST' && <p className="text-xs text-text-secondary">Sincroniza costos desde BSale (pantalla BSale) o revisa que el SKU tenga recepciones con costo.</p>}
    </div>
  );
}

function QuoteResult({ q, stale }: { q: SheetingQuote; stale: boolean }) {
  const c = q.consumption;
  const wasteHigh = c.wastePct > 0.25;
  const staleCost = q.fabrics.some((f) => f.cost.costSource === 'stale');
  return (
    <div className={`space-y-4 transition-opacity ${stale ? 'opacity-60' : ''}`}>
      {/* 1 · metres */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Big title="Metros por unidad" value={fmtM(c.linearMetresPerUnit)} sub={`+${fmtPct(c.cuttingScrapPct)} merma de corte → ${fmtM(c.linearMetresWithScrapPerUnit)}`} accent />
        <Big title={`Total para ${q.qty} u.`} value={fmtM(c.linearMetresWithScrapTotal)} sub="Lo que se pide al proveedor" accent />
        <Big title="Merma de encaje" value={fmtPct(c.wastePct)} sub={`${c.netAreaM2PerUnit.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m² netos de ${c.rollAreaM2PerUnit.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m² de rollo`} warn={wasteHigh} />
        <Big title="Costo unitario" value={fmtClp(q.cost.total)} sub={`${fmtClp(q.cost.totalQty)} por ${q.qty} u.`} />
      </div>
      {wasteHigh && <p className="text-xs text-brand-amber">Merma sobre 25 %: convendría un rollo más angosto para esta talla.</p>}
      {staleCost && <p className="text-xs text-brand-amber">Costo de tela desactualizado: la última sincronización con BSale es más vieja que la ventana configurada.</p>}

      {/* 2 · cut instructions per fabric */}
      {q.fabrics.map((f) => (
        <div key={f.slot} className="bg-bg-secondary border border-border-primary rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={f.slot === 'base' ? 'Centro' : f.slot === 'marco' ? 'Marco' : f.slot} variant={f.slot === 'base' ? 'blue' : 'purple'} />
            <span className="text-sm font-semibold text-text-primary">{f.name}</span>
            <span className="text-xs text-text-muted">rollo {f.rollWidthCm} cm · útil {f.usableWidthCm} cm{f.directional ? ' · direccional' : ''}</span>
            <span className="flex-1" />
            <span className="text-xs text-text-secondary">{fmtM(f.consumption.linearMetresPerUnit)}/u · {fmtClp(f.cost.pricePerLinearMetre)}/ml <span className={f.cost.costSource === 'stale' ? 'text-brand-amber' : 'text-text-muted'}>({f.cost.costSource === 'bsale' ? 'BSale' : 'desactualizado'}{f.cost.costSyncedAt ? ` ${f.cost.costSyncedAt.slice(0, 10)}` : ''})</span></span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <table className="text-xs w-full">
              <thead><tr className="text-text-muted"><th className="text-left py-1">Pieza</th><th className="text-right py-1">Corte</th><th className="text-left py-1 pl-3">Orientación</th><th className="text-right py-1">A lo ancho</th><th className="text-right py-1">ml/u</th></tr></thead>
              <tbody>
                {q.pieces.filter((p) => p.fabricSlot === f.slot).map((p) => (
                  <tr key={p.role} className="border-t border-border-secondary">
                    <td className="py-1 text-text-primary">{p.count}× {p.role}{p.mitred45 ? <span className="text-text-muted"> · 45°</span> : ''}</td>
                    <td className="py-1 text-right font-mono text-text-secondary">{p.widthCm} × {p.lengthCm}</td>
                    <td className="py-1 pl-3 text-text-secondary">{ORIENTATION[p.orientation]}</td>
                    <td className="py-1 text-right text-text-secondary">{p.piecesAcross}</td>
                    <td className="py-1 text-right text-text-secondary">{p.linearMetresPerUnit.toLocaleString('es-CL', { maximumFractionDigits: 3 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <RollLayout rollWidthCm={f.rollWidthCm} usableWidthCm={f.usableWidthCm} pieces={q.pieces.filter((p) => p.fabricSlot === f.slot)} />
          </div>
        </div>
      ))}

      {/* 3 · cost breakdown and price */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-sm space-y-1">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Costo por unidad</h3>
          <Row label={`Tela (${fmtM(c.linearMetresWithScrapPerUnit)})`} value={q.cost.fabric} />
          <Row label={`Taller${q.labourRate.sizeLabel ? ` · ${q.labourRate.sizeLabel}` : ''}${q.labourRate.quality ? ` · ${q.labourRate.quality}` : ''}`} value={q.cost.labour} />
          <Row label="Empaque" value={q.cost.packaging} />
          <Row label="Traslado" value={q.cost.freight} />
          <Row label="Insumos" value={q.cost.supplies} />
          <div className="border-t border-border-primary pt-1 mt-1"><Row label="Total" value={q.cost.total} bold /></div>
          <p className="text-[11px] text-text-muted pt-2">
            Costo teórico por área (criterio del Excel): tela {fmtClp(q.theoretical.fabric)} = {q.theoretical.netAreaM2.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m² × {fmtClp(q.theoretical.pricePerM2)}/m².
            Difiere {q.theoretical.deltaPct >= 0 ? '+' : ''}{fmtPct(q.theoretical.deltaPct)} porque la tela se compra por metro de rollo y lo que sobra a lo ancho se paga igual.
          </p>
        </div>
        <div className="bg-bg-secondary border border-border-primary rounded-xl p-4 text-sm space-y-1">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Precio de venta · {q.channel} ×{q.price.marginFactor}</h3>
          <Row label="PVP neto" value={q.price.netPvp} bold />
          <Row label={`PVP con IVA (${fmtPct(q.price.vatRate)})`} value={q.price.grossPvp} bold />
          <p className="text-[11px] text-text-muted pt-2">Modelo {q.model.code} v{q.model.version} · parámetros v{q.paramsVersion} · lote de corte {c.cutBatchUnits} u.</p>
          {q.warnings.length > 0 && <p className="text-[11px] text-brand-amber">{q.warnings.join(' · ')}</p>}
        </div>
      </div>
    </div>
  );
}

function Big({ title, value, sub, accent, warn }: { title: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? 'border-brand-amber/40 bg-brand-amber/5' : accent ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-border-primary bg-bg-secondary'}`}>
      <p className="text-[11px] text-text-muted uppercase tracking-wider">{title}</p>
      <p className={`text-xl font-bold mt-1 ${warn ? 'text-brand-amber' : 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-[11px] text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
      <span>{label}</span><span className="tabular-nums">{fmtClp(value)}</span>
    </div>
  );
}
