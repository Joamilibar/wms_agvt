import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// Auth
export const useLogin = () => useMutation({
  mutationFn: (data: { email: string; password: string }) => api.post('/auth/login', data).then(r => r.data),
});

// Users (admin)
export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'supervisor' | 'operator';
  warehouse: string;
  isActive: boolean;
  lastLogin: string | null;
}

export const useUsers = () => useQuery({
  queryKey: ['users'],
  queryFn: () => api.get('/users').then(r => r.data as ApiUser[]),
});

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/users', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/users/${id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); },
  });
};

export const useDeactivateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); },
  });
};

// Dashboard
export const useDashboardKPIs = (warehouse?: string) => useQuery({
  queryKey: ['dashboard', warehouse],
  queryFn: () => api.get('/analytics/dashboard', { params: { warehouse } }).then(r => r.data),
});

// Stock
export const useStock = (params?: Record<string, unknown>) => useQuery({
  queryKey: ['stock', params],
  queryFn: () => api.get('/stock', { params }).then(r => r.data),
});

export const useStockSummary = (warehouse?: string) => useQuery({
  queryKey: ['stockSummary', warehouse],
  queryFn: () => api.get('/stock/summary', { params: { warehouse } }).then(r => r.data),
});

export const useCreateStockLot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/stock', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock'] }); qc.invalidateQueries({ queryKey: ['stockSummary'] }); },
  });
};

// Orders
export const useOrders = (params?: Record<string, unknown>) => useQuery({
  queryKey: ['orders', params],
  queryFn: () => api.get('/orders', { params }).then(r => r.data),
});

export const useCreateOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/orders', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

export const useStartOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/orders/${id}/start`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

export const useProcessFIFO = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: { sku: string; qty: number }[] }) =>
      api.post(`/orders/${id}/process-fifo`, { items }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['stockSummary'] });
      qc.invalidateQueries({ queryKey: ['picking-logs'] });
    },
  });
};

export const useCancelOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/cancel`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
};

// Guides
export const useGuides = (params?: Record<string, unknown>) => useQuery({
  queryKey: ['guides', params],
  queryFn: () => api.get('/guides', { params }).then(r => r.data),
});

export const useCreateGuide = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/guides', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guides'] }),
  });
};

// Analytics
export interface AbcResponse {
  items: Record<string, unknown>[];
  priceBasis: { bsale_document: number; lot_cost: number; seed: number; revenueShare: number };
}

export const useABC = (warehouse?: string) => useQuery({
  queryKey: ['abc', warehouse],
  queryFn: () => api.get('/analytics/abc', { params: { warehouse } }).then(r => r.data as AbcResponse),
});

export const useCoverage = (warehouse?: string) => useQuery({
  queryKey: ['coverage', warehouse],
  queryFn: () => api.get('/analytics/coverage', { params: { warehouse } }).then(r => r.data),
});

export const useAging = (warehouse?: string) => useQuery({
  queryKey: ['aging', warehouse],
  queryFn: () => api.get('/analytics/aging', { params: { warehouse } }).then(r => r.data),
});

export const useAgingSummary = (warehouse?: string) => useQuery({
  queryKey: ['agingSummary', warehouse],
  queryFn: () => api.get('/analytics/aging/summary', { params: { warehouse } }).then(r => r.data),
});

// BSale
export const useBsaleStatus = () => useQuery({
  queryKey: ['bsale-status'],
  queryFn: () => api.get('/bsale/status').then(r => r.data),
});

export const useBsaleDocuments = (params?: { limit?: number; officeid?: string; number?: string }) => useQuery({
  queryKey: ['bsale-documents', params],
  queryFn: () => {
    const q = new URLSearchParams();
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.officeid) q.append('officeid', params.officeid);
    if (params?.number) q.append('number', params.number);
    return api.get(`/bsale/documents?${q.toString()}`).then(r => r.data);
  },
  enabled: true,
});

export const useBsaleOffices = () => useQuery({
  queryKey: ['bsale-offices'],
  queryFn: () => api.get('/bsale/offices').then(r => r.data),
});

export const useBsaleClients = (search?: string) => useQuery({
  queryKey: ['bsale-clients', search],
  queryFn: () => api.get(`/bsale/clients${search ? `?q=${encodeURIComponent(search)}` : ''}`).then(r => r.data),
  staleTime: 60000,
});

export const useBsaleDocumentDetails = (id?: string) => useQuery({
  queryKey: ['bsale-document-details', id],
  queryFn: () => api.get(`/bsale/documents/${id}/details`).then(r => r.data),
  enabled: !!id,
});

export const useBsaleStocksBulk = (officeid: string | null, variantids: string[]) => useQuery({
  queryKey: ['bsale-stocks', officeid, variantids],
  queryFn: () => api.get(`/bsale/stocks/bulk?officeid=${officeid}&variantids=${variantids.join(',')}`).then(r => r.data),
  enabled: !!officeid && variantids.length > 0,
});

// Picking Logs
export const usePickingLogs = (orderId?: string) => useQuery({
  queryKey: ['picking-logs', orderId],
  queryFn: () => api.get(orderId ? `/picking-log/order/${orderId}` : '/picking-log').then(r => r.data),
});

// M-07: /bsale/sync-stock now returns { jobId, status } immediately and the
// work runs on a BullMQ worker. Kick it off here, then poll with
// useBsaleSyncJob until the job reaches a terminal state.
export const useSyncBsaleStock = () => useMutation({
  mutationFn: (clearExisting: boolean) =>
    api.post('/bsale/sync-stock', { clearExisting })
      .then(r => r.data as { jobId: string; status: string }),
});

export interface BsaleSyncJob {
  jobId: string;
  state: 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'unknown';
  attemptsMade: number;
  result: {
    consumed: number;
    created: number;
    skipped: number;
    archived: number;
    unchanged: number;
    increased: number;
    decreased: number;
    skusChecked: number;
    errors: string[];
  } | null;
  failedReason: string | null;
  queuedAt: string | null;
  finishedAt: string | null;
}

const JOB_SETTLED = ['completed', 'failed'];

export const useBsaleSyncJob = (jobId: string | null) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['bsaleSyncJob', jobId],
    enabled: !!jobId,
    queryFn: () => api.get(`/bsale/sync-jobs/${jobId}`).then(r => r.data as BsaleSyncJob),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state && JOB_SETTLED.includes(state)) {
        // The worker rewrote the lots; drop the cached inventory views.
        qc.invalidateQueries({ queryKey: ['stock'] });
        qc.invalidateQueries({ queryKey: ['stockSummary'] });
        return false;
      }
      return 2000;
    },
  });
};

// Packs
export interface PackComponentAvailability {
  sku: string;
  name: string;
  qtyPerPack: number;
  physical: number;
  reserved: number;
  available: number;
  /** Complete packs this component alone could cover. */
  packsFromThis: number;
}

export interface PackAvailability {
  packSku: string;
  name: string;
  bsaleVariantId: string | null;
  warehouse: string;
  packsAvailable: number;
  packsPhysical: number;
  /** The component that caps the total — what to replenish first. */
  limitedBy: PackComponentAvailability | null;
  components: PackComponentAvailability[];
}

export interface PackRecipe {
  packSku: string;
  name: string;
  bsaleVariantId: string | null;
  components: { sku: string; name: string; bsaleVariantId: string | null; qtyPerPack: number }[];
  isActive: boolean;
  notes: string;
}

export interface PackImportResult {
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: string[];
  warnings: string[];
}

export const usePacks = () => useQuery({
  queryKey: ['packs'],
  queryFn: () => api.get('/packs').then(r => r.data as PackRecipe[]),
});

export const usePackAvailability = (warehouse?: string) => useQuery({
  queryKey: ['packAvailability', warehouse],
  queryFn: () => api.get('/packs/availability', { params: { warehouse } }).then(r => r.data as PackAvailability[]),
});

export const useImportPacksFromBsale = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/packs/import-bsale').then(r => r.data as PackImportResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packs'] });
      qc.invalidateQueries({ queryKey: ['packAvailability'] });
    },
  });
};

// Planning (Fase 0)
export interface HistoryWindow {
  from: string; to: string; fromMonth: string; toMonth: string; months: number; monthKeys: string[];
}
export type WarehouseRole = 'sellable' | 'store' | 'workshop' | 'raw' | 'reserved' | 'project';
export type PlanningUse = 'purchase' | 'production' | 'store';
export interface PlanningWarehouse {
  _id: string; name: string; bsaleOfficeId: string | null; role: WarehouseRole; countsFor: PlanningUse[]; isActive: boolean; notes: string;
}
export interface PlanningSupplier {
  _id: string; name: string; currency: string; leadTimeDays: number; transitDays: number; cadenceDays: number;
  containerMin: number | null; moqScope: 'sku' | 'family' | 'order'; landedFactor: number; paymentTerms: string; isActive: boolean; notes: string;
}
export type ItemOrigin = 'imported' | 'national' | 'raw_material' | 'supply' | 'pack' | 'service' | 'unknown';
export type Lifecycle = 'new' | 'active' | 'phase_out' | 'discontinued';
export interface PlanningItem {
  _id: string; sku: string; name: string; category: string; origin: ItemOrigin;
  supplierId: PlanningSupplier | null; leadTimeDays: number | null; transitDays: number | null; moq: number | null; orderMultiple: number;
  familyKey: string | null; lifecycle: Lifecycle; launchDate: string | null;
  successorSku: string | null; analogSku: string | null; isHotelLine: boolean; fobCost: number | null; costCurrency: string | null; notes: string;
}
export interface PlanningAlerts { importedWithoutSupplier: number; unknownOrigin: number; total: number }
export type Channel = 'retail' | 'project';
export interface MonthlyTotal { _id: { month: string; channel: Channel }; units: number; net: number; lines: number }
export interface SkuSeriesRow { _id: { month: string; channel: Channel; warehouse?: string }; units: number; net: number; viaPack: number }
export interface HistoryDocument {
  _id: number; docKey: string; docType: string; date: string; month: string; warehouse: string; customerName: string; customerRut: string | null;
  channel: Channel; channelOverride: Channel | null; channelReason: string; units: number; net: number; isOutlier: boolean; refDocId: number | null;
}
export interface HistoryCoverage { firstMonth: string | null; lastMonth: string | null; lines: number; documents: number }
export interface PurchaseOrderLine { sku: string; name: string; qtyOrdered: number; qtyReceived: number; eta: string | null; unitCost: number | null }
export interface PurchaseOrder {
  _id: string; number: string; supplierName: string; status: 'draft' | 'approved' | 'sent' | 'partial' | 'received' | 'cancelled';
  currency: string; destinationWarehouse: string; lines: PurchaseOrderLine[]; source: string; notes: string; createdAt: string;
}
export interface HistoryLoadResult {
  from: string; to: string; documents: number; skippedDocuments: number; lines: number; packLinesExploded: number;
  creditNotesLinked: number; creditNotesUnlinked: number; outlierDocs: number; outlierThreshold: number;
  byChannel: Record<Channel, { documents: number; units: number }>; warnings: string[];
}
export interface HistoryJob { jobId: string; state: string; result: HistoryLoadResult | null; failedReason: string | null }

export const usePlanningWindow = () => useQuery({ queryKey: ['planning', 'window'], queryFn: () => api.get('/planning/window').then(r => r.data as HistoryWindow) });
export const useHistoryCoverage = () => useQuery({ queryKey: ['planning', 'coverage'], queryFn: () => api.get('/planning/sales-history/coverage').then(r => r.data as HistoryCoverage) });
export const useHistoryMonthly = () => useQuery({ queryKey: ['planning', 'monthly'], queryFn: () => api.get('/planning/sales-history/monthly').then(r => r.data as MonthlyTotal[]) });
export const useSkuSeries = (sku: string, byWarehouse = false) => useQuery({
  queryKey: ['planning', 'sku', sku, byWarehouse], enabled: sku.length > 0,
  queryFn: () => api.get(`/planning/sales-history/sku/${encodeURIComponent(sku)}`, { params: { byWarehouse } }).then(r => r.data as SkuSeriesRow[]),
});
export const useHistoryDocuments = (params: { channel?: string; month?: string; search?: string; page?: number }) => useQuery({
  queryKey: ['planning', 'documents', params],
  queryFn: () => api.get('/planning/sales-history/documents', { params }).then(r => r.data as { data: HistoryDocument[]; total: number; page: number; limit: number }),
});
export const useOverrideChannel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bsaleDocId, channel, reason }: { bsaleDocId: number; channel: Channel | null; reason: string }) =>
      api.patch(`/planning/sales-history/documents/${bsaleDocId}/channel`, { channel: channel ?? undefined, reason }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning'] }); },
  });
};
export const useLoadHistory = () => useMutation({
  mutationFn: (range: { from?: string; to?: string }) => api.post('/planning/sales-history/load', range).then(r => r.data as { jobId: string }),
});
export const useHistoryJob = (jobId: string | null) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['planning', 'historyJob', jobId], enabled: !!jobId,
    queryFn: () => api.get(`/planning/sales-history/jobs/${jobId}`).then(r => r.data as HistoryJob),
    refetchInterval: (q) => {
      const s = q.state.data?.state;
      if (s === 'completed' || s === 'failed') { qc.invalidateQueries({ queryKey: ['planning'] }); return false; }
      return 3000;
    },
  });
};
export const usePlanningWarehouses = () => useQuery({ queryKey: ['planning', 'warehouses'], queryFn: () => api.get('/planning/warehouses').then(r => r.data as PlanningWarehouse[]) });
export const useUpdateWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<PlanningWarehouse, 'role' | 'countsFor' | 'isActive' | 'notes'>> }) =>
      api.patch(`/planning/warehouses/${id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'warehouses'] }); },
  });
};
export const useSuppliers = () => useQuery({ queryKey: ['planning', 'suppliers'], queryFn: () => api.get('/planning/suppliers', { params: { includeInactive: true } }).then(r => r.data as PlanningSupplier[]) });
export const useSaveSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<PlanningSupplier> }) =>
      (id ? api.patch(`/planning/suppliers/${id}`, data) : api.post('/planning/suppliers', data)).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning'] }); },
  });
};
export const usePlanningItems = (params: { origin?: string; lifecycle?: string; missingSupply?: string; search?: string }) => useQuery({
  queryKey: ['planning', 'items', params], queryFn: () => api.get('/planning/items', { params }).then(r => r.data as PlanningItem[]),
});
export const usePlanningAlerts = () => useQuery({ queryKey: ['planning', 'alerts'], queryFn: () => api.get('/planning/items/alerts').then(r => r.data as PlanningAlerts) });
export const useUpdatePlanningItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sku, data }: { sku: string; data: Record<string, unknown> }) => api.patch(`/planning/items/${encodeURIComponent(sku)}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'items'] }); qc.invalidateQueries({ queryKey: ['planning', 'alerts'] }); },
  });
};
export const usePurchaseOrders = () => useQuery({ queryKey: ['planning', 'purchaseOrders'], queryFn: () => api.get('/planning/purchase-orders').then(r => r.data as PurchaseOrder[]) });
export const useSetPoEta = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sku, eta }: { id: string; sku: string; eta: string | null }) =>
      api.patch(`/planning/purchase-orders/${id}/lines/${encodeURIComponent(sku)}/eta`, { eta }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'purchaseOrders'] }); },
  });
};
