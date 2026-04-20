import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  useBsaleDocuments,
  useBsaleDocumentDetails,
  useCreateOrder,
  useBsaleOffices,
  useBsaleClients,
  useStockSummary,
  useBsaleStocksBulk,
} from '../../hooks/useApi';

type DestinationType = 'client' | 'internal_production' | 'store_restock';
type OriginMode = 'manual' | 'bsale';

export default function CreatePickingModal({ onClose }: { onClose: () => void }) {
  // ── Mode ──────────────────────────────────────────────────────────
  const [originMode, setOriginMode] = useState<OriginMode>('manual');
  const [destinationType, setDestinationType] = useState<DestinationType>('client');

  // ── Offices / Warehouses ──────────────────────────────────────────
  const [selectedOriginOfficeId, setSelectedOriginOfficeId] = useState('');
  const [selectedDestOfficeId, setSelectedDestOfficeId] = useState('');

  // ── Client mode ───────────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [selectedBsaleClientId, setSelectedBsaleClientId] = useState('');
  const [selectedBsaleClientName, setSelectedBsaleClientName] = useState('');
  const [generateGuide, setGenerateGuide] = useState(false);

  // ── BSale document mode ───────────────────────────────────────────
  const [searchNumber, setSearchNumber] = useState('');
  const [queryTrigger, setQueryTrigger] = useState<{ limit?: number; number?: string }>({});
  const [selectedBsaleDocId, setSelectedBsaleDocId] = useState('');

  // ── Items ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<{ sku: string; name: string; requestedQty: number; maxQty?: number; variantId?: string }[]>([]);

  // ── Queries ───────────────────────────────────────────────────────
  const officesQuery   = useBsaleOffices();
  const clientsQuery   = useBsaleClients(clientSearch.length >= 2 ? clientSearch : undefined);
  const stockSummary   = useStockSummary('Central');
  const variantIds     = useMemo(() => items.map(i => i.variantId).filter(Boolean) as string[], [items]);
  const bsaleStockQuery = useBsaleStocksBulk(selectedOriginOfficeId || null, variantIds);
  const documentsQuery = useBsaleDocuments(queryTrigger);
  const detailsQuery   = useBsaleDocumentDetails(selectedBsaleDocId || undefined);
  const createOrder    = useCreateOrder();

  // ── Derived client string ─────────────────────────────────────────
  const clientLabel = useMemo(() => {
    if (originMode === 'bsale') {
      const doc = documentsQuery.data?.items?.find((d: any) => d.id.toString() === selectedBsaleDocId);
      return doc ? (doc.client?.company || [doc.client?.firstName, doc.client?.lastName].filter(Boolean).join(' ') || '') : '';
    }
    if (destinationType === 'client') return selectedBsaleClientName;
    const destOffice = officesQuery.data?.items?.find((o: any) => o.id.toString() === selectedDestOfficeId);
    return destOffice?.name || '';
  }, [originMode, destinationType, selectedBsaleClientName, selectedDestOfficeId, officesQuery.data, documentsQuery.data, selectedBsaleDocId]);

  // ── Populate items from BSale document details ────────────────────
  useEffect(() => {
    if (!selectedBsaleDocId || !detailsQuery.data) return;
    const list = detailsQuery.data.items || detailsQuery.data || [];
    const mapped = list.map((i: any) => {
      const pendingQty = i.pendingQuantity !== undefined ? i.pendingQuantity : i.quantity;
      return {
        sku: i.variant?.code || 'SIN-CODE',
        variantId: i.variant?.id?.toString() || i.variant?.href?.split('/').pop()?.split('.')[0],
        name: i.variant?.description || 'Desconocido',
        requestedQty: pendingQty,
        maxQty: pendingQty,
      };
    }).filter((i: any) => (i.maxQty || 0) > 0);
    setItems(mapped);
  }, [detailsQuery.data, selectedBsaleDocId]);

  // ── Item helpers ──────────────────────────────────────────────────
  const addItem    = () => setItems(prev => [...prev, { sku: '', name: '', requestedQty: 1 }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = useCallback((index: number, field: string, value: string | number) => {
    setItems(prev => { const n = [...prev]; n[index] = { ...n[index], [field]: value }; return n; });
  }, []);

  const stockForItem = (item: typeof items[0]) => {
    if (originMode === 'bsale' || (originMode === 'manual' && selectedOriginOfficeId)) {
      return bsaleStockQuery.data && item.variantId ? (bsaleStockQuery.data[item.variantId] ?? 0) : 0;
    }
    return stockSummary.data?.find((s: any) => s.sku === item.sku)?.totalQty ?? 0;
  };

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(i => i.sku && i.requestedQty > 0);
    if (!clientLabel || validItems.length === 0) return alert('Completa los campos obligatorios.');

    let bsaleOriginType = 'manual';
    if (originMode === 'bsale') {
      const doc = documentsQuery.data?.items?.find((d: any) => d.id.toString() === selectedBsaleDocId);
      if (doc) {
        const name = (doc.document_type?.name || '').toLowerCase();
        if (name.includes('factura')) bsaleOriginType = 'bsale_factura';
        else if (name.includes('boleta')) bsaleOriginType = 'bsale_boleta';
        else bsaleOriginType = 'bsale_guia';
      }
    }

    try {
      await createOrder.mutateAsync({
        client: clientLabel,
        destinationType,
        generateGuide,
        bsaleClientId: selectedBsaleClientId ? parseInt(selectedBsaleClientId) : undefined,
        bsaleDestinationOfficeId: selectedDestOfficeId ? parseInt(selectedDestOfficeId) : undefined,
        bsaleOfficeId: selectedOriginOfficeId ? parseInt(selectedOriginOfficeId) : undefined,
        originType: bsaleOriginType,
        bsaleDocumentId: selectedBsaleDocId || undefined,
        bsaleDocumentNumber: documentsQuery.data?.items?.find((d: any) => d.id.toString() === selectedBsaleDocId)?.number?.toString(),
        type: 'picking',
        priority: 'normal',
        warehouse: 'Central',
        items: validItems,
      } as any);
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al generar picking');
    }
  };

  const offices = officesQuery.data?.items || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary w-full max-w-2xl rounded-2xl border border-border-primary shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <h2 className="text-lg font-bold text-text-primary">Nueva Orden de Picking</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Mode tabs */}
          <div className="flex gap-3 mb-5">
            {(['manual', 'bsale'] as OriginMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setOriginMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${originMode === m ? 'bg-brand-blue/10 border-brand-blue text-brand-blue' : 'bg-bg-tertiary border-border-primary text-text-muted hover:border-border-secondary'}`}
              >
                {m === 'manual' ? 'Creación Manual' : 'Cargar desde BSale'}
              </button>
            ))}
          </div>

          <form id="picking-form" onSubmit={handleSubmit} className="space-y-4">

            {/* ── BODEGA DE ORIGEN (always shown) ───────────────────── */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">Sucursal / Bodega de Origen</label>
              <select
                value={selectedOriginOfficeId}
                onChange={e => setSelectedOriginOfficeId(e.target.value)}
                className="w-full bg-bg-tertiary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
                required
              >
                <option value="">Seleccione bodega de origen</option>
                {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            {/* ── MANUAL MODE ────────────────────────────────────────── */}
            {originMode === 'manual' && (
              <div className="space-y-4">
                {/* Destination type selector */}
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1.5">Tipo de Destinatario</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'client',              label: 'Cliente' },
                      { value: 'internal_production', label: 'Interno / Producción' },
                      { value: 'store_restock',       label: 'Reposición Tiendas' },
                    ] as { value: DestinationType; label: string }[]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDestinationType(opt.value)}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-all ${destinationType === opt.value ? 'bg-brand-blue/10 border-brand-blue text-brand-blue' : 'bg-bg-tertiary border-border-primary text-text-muted hover:border-border-secondary'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CLIENT sub-section */}
                {destinationType === 'client' && (
                  <div className="space-y-3 bg-bg-primary/40 p-3 rounded-lg border border-border-primary">
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1.5">Buscar Cliente (RUT / Nombre)</label>
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setSelectedBsaleClientId(''); setSelectedBsaleClientName(''); }}
                        placeholder="Ej: García, 12.345.678-9..."
                        className="w-full bg-bg-tertiary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
                      />
                    </div>
                    {clientsQuery.data?.items?.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-text-muted mb-1.5">Seleccionar Cliente</label>
                        <select
                          value={selectedBsaleClientId}
                          onChange={e => {
                            const id = e.target.value;
                            setSelectedBsaleClientId(id);
                            const found = clientsQuery.data.items.find((c: any) => c.id.toString() === id);
                            if (found) setSelectedBsaleClientName(found.company || [found.firstName, found.lastName].filter(Boolean).join(' '));
                          }}
                          className="w-full bg-bg-tertiary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
                          required={destinationType === 'client'}
                        >
                          <option value="">— Seleccione cliente —</option>
                          {clientsQuery.data.items.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.company || [c.firstName, c.lastName].filter(Boolean).join(' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {clientSearch.length >= 2 && clientsQuery.isFetching && <p className="text-xs text-brand-blue">Buscando clientes...</p>}
                    {clientSearch.length >= 2 && !clientsQuery.isFetching && !clientsQuery.data?.items?.length && (
                      <p className="text-xs text-brand-orange">Sin resultados. Intenta otro término.</p>
                    )}

                    {/* Generate Guide toggle */}
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input type="checkbox" checked={generateGuide} onChange={e => setGenerateGuide(e.target.checked)}
                        className="w-4 h-4 rounded accent-brand-blue" />
                      <span className="text-xs text-text-secondary">Generar Guía de Despacho en BSale al completar</span>
                    </label>
                  </div>
                )}

                {/* INTERNAL / RESTOCK sub-section */}
                {(destinationType === 'internal_production' || destinationType === 'store_restock') && (
                  <div className="space-y-3 bg-bg-primary/40 p-3 rounded-lg border border-border-primary">
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1.5">
                        {destinationType === 'internal_production' ? 'Taller / Bodega de Destino' : 'Tienda / Sucursal de Destino'}
                      </label>
                      <select
                        value={selectedDestOfficeId}
                        onChange={e => setSelectedDestOfficeId(e.target.value)}
                        className="w-full bg-bg-tertiary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
                        required={(destinationType as string) !== 'client'}
                      >
                        <option value="">— Seleccione destino —</option>
                        {offices.filter((o: any) => o.id.toString() !== selectedOriginOfficeId).map((o: any) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Generate Internal Movement toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={generateGuide} onChange={e => setGenerateGuide(e.target.checked)}
                        className="w-4 h-4 rounded accent-brand-blue" />
                      <span className="text-xs text-text-secondary">
                        Registrar Movimiento de Stock Interno en BSale al completar
                      </span>
                    </label>

                    {selectedOriginOfficeId && selectedDestOfficeId && (
                      <div className="flex gap-2 text-xs text-text-muted bg-bg-tertiary/60 p-2 rounded border border-border-secondary">
                        <span className="text-brand-green font-mono">
                          {offices.find((o: any) => o.id.toString() === selectedOriginOfficeId)?.name || '—'}
                        </span>
                        <span>→</span>
                        <span className="text-brand-blue font-mono">
                          {offices.find((o: any) => o.id.toString() === selectedDestOfficeId)?.name || '—'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── BSALE MODE ─────────────────────────────────────────── */}
            {originMode === 'bsale' && (
              <div className="space-y-3 bg-bg-primary/50 p-3 rounded-lg border border-border-primary">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-text-muted mb-1.5">N° Documento BSale</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={searchNumber}
                        onChange={e => setSearchNumber(e.target.value)}
                        placeholder="Ej: 8756"
                        className="w-full bg-bg-tertiary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
                      />
                      <button type="button" onClick={() => setQueryTrigger({ limit: 50, number: searchNumber })}
                        disabled={!searchNumber || documentsQuery.isFetching}
                        className="bg-brand-blue text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50">
                        Buscar
                      </button>
                    </div>
                  </div>
                </div>

                {documentsQuery.isFetching && <p className="text-sm text-brand-blue">Buscando...</p>}
                {documentsQuery.data?.items?.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Documentos encontrados</label>
                    <select
                      value={selectedBsaleDocId}
                      onChange={e => setSelectedBsaleDocId(e.target.value)}
                      className="w-full bg-bg-tertiary border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-blue"
                    >
                      <option value="">Seleccione un documento</option>
                      {documentsQuery.data.items.map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.document_type?.name} #{d.number} — {d.client?.company || [d.client?.firstName, d.client?.lastName].filter(Boolean).join(' ') || 'S/N'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {queryTrigger.number && !documentsQuery.isFetching && !documentsQuery.data?.items?.length && (
                  <p className="text-xs text-brand-orange">Sin resultados para ese N°.</p>
                )}
                {detailsQuery.isFetching && <p className="text-xs text-brand-green">Cargando líneas...</p>}
              </div>
            )}

            {/* ── CLIENT / DESTINATION summary ────────────────────────── */}
            {clientLabel && (
              <div className="bg-bg-tertiary/50 border border-border-secondary rounded-lg px-3 py-2 text-sm text-text-secondary">
                <span className="text-xs text-text-muted">Destino: </span>
                <span className="font-medium text-text-primary">{clientLabel}</span>
              </div>
            )}

            {/* ── ITEMS TABLE ─────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3 mt-2">
                <label className="block text-xs font-medium text-text-muted">Productos a Pickear</label>
                {originMode === 'manual' && (
                  <button type="button" onClick={addItem}
                    className="text-xs bg-brand-blue/20 text-brand-blue px-2 py-1 rounded hover:bg-brand-blue/30 transition-colors">
                    + Añadir Línea
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-bg-tertiary p-2 rounded-lg border border-border-secondary">
                    <input type="text" value={item.sku} onChange={e => updateItem(idx, 'sku', e.target.value)}
                      placeholder="SKU" readOnly={originMode === 'bsale'}
                      className="w-1/5 bg-transparent border-none text-xs text-text-secondary focus:ring-0" required />
                    <input type="text" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                      placeholder="Descripción" readOnly={originMode === 'bsale'}
                      className="flex-1 bg-transparent border-none text-sm text-text-primary focus:ring-0" />

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="block text-[10px] text-text-muted">Disponible</span>
                        <span className="text-xs font-bold text-brand-green">{stockForItem(item)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="number" value={item.requestedQty}
                          onChange={e => updateItem(idx, 'requestedQty', parseInt(e.target.value) || 0)}
                          min={1} max={originMode === 'bsale' ? item.maxQty : undefined}
                          className="w-16 bg-bg-primary rounded border border-border-primary px-2 py-1 text-sm text-center focus:outline-none focus:border-brand-blue" required />
                        {originMode === 'bsale' && <span className="text-[10px] text-text-muted">/ {item.maxQty}</span>}
                      </div>
                    </div>

                    <button type="button" onClick={() => removeItem(idx)} className="text-text-muted hover:text-brand-red p-1 ml-1 text-sm">✕</button>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-4 bg-bg-tertiary rounded-lg border border-border-secondary border-dashed">
                    Sin productos definidos.
                  </p>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-primary bg-bg-tertiary/50">
          <button type="submit" form="picking-form"
            disabled={createOrder.isPending || items.length === 0}
            className="w-full py-2.5 bg-gradient-to-r from-brand-blue to-brand-green text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-brand-blue/20 transition-all disabled:opacity-50">
            {createOrder.isPending ? 'Guardando...' : 'Generar Orden de Picking'}
          </button>
        </div>
      </div>
    </div>
  );
}
