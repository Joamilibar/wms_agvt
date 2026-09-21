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

/** Result of a cost pass: every active lot valued at BSale's average cost (CLP). */
export interface BsaleCostSyncResult { skus: number; valued: number; lotsUpdated: number; withoutCost: string[]; errors: string[] }
export const useSyncBsaleCosts = () => useMutation({
  mutationFn: () => api.post('/bsale/sync-costs').then(r => r.data as { jobId: string; status: string }),
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
    costs: BsaleCostSyncResult | null;
  } | BsaleCostSyncResult | null;
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
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['planning', 'kpis'] });
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

// Planning (Fase 1): runs, proposal, purchase-order cycle
export type SkuState = 'NUEVO' | 'SIN_VENTA' | 'QUIEBRE' | 'REPONER' | 'OK' | 'SOBRE_STOCK' | 'PHASE_OUT' | 'DESCONTINUADO';
export interface RunResult {
  sku: string; name: string; category: string; origin: ItemOrigin; supplierName: string | null; supplierId: string | null; moq: number | null; unitCost: number | null;
  abc: 'A' | 'B' | 'C'; pattern: 'smooth' | 'erratic' | 'intermittent' | 'lumpy' | null; lifecycle: Lifecycle;
  monthsOfData: number; monthsWithSales: number; firstSaleMonth: string | null;
  base: number | null; seasonalNext: number; growth: number; demandNext: number; demandMonthly: number; sigma: number; leadTimeDays: number;
  ssRule: number; ssStat: number | null; ss: number; rop: number; target: number;
  available: number; inTransit: number; inTransitLate: number; position: number; suggested: number; rounded: number; moqExceedsHorizon: boolean;
  coverageDays: number | null; coverageMonths: number | null;
  yoy: { month: string; lastYear: number | null; forecast: number; deltaPct: number | null; alert: boolean };
  state: SkuState; reasons: string[];
}
export interface PlanningRunHeader {
  _id: string; number: string; status: 'draft' | 'approved' | 'superseded'; asOf: string; fromMonth: string; toMonth: string; paramsVersion: number;
  purchaseWarehouses: string[]; summary: Record<string, number>; notes: string; createdAt: string; approvedAt: string | null;
}
export interface ProposalGroup {
  supplierId: string | null; supplierName: string; currency: string; containerMin: number | null; cadenceDays: number | null;
  lines: RunResult[]; units: number; value: number;
}

export const usePlanningRuns = () => useQuery({ queryKey: ['planning', 'runs'], queryFn: () => api.get('/planning/runs').then(r => r.data as PlanningRunHeader[]) });
export const useLatestRun = () => useQuery({ queryKey: ['planning', 'runs', 'latest'], queryFn: () => api.get('/planning/runs/latest').then(r => r.data as PlanningRunHeader | null) });
export const useRunResults = (runId: string | null, params: { state?: string; origin?: string; supplierId?: string; abc?: string; search?: string; onlySuggested?: boolean }) => useQuery({
  queryKey: ['planning', 'runs', runId, 'results', params], enabled: !!runId,
  queryFn: () => api.get(`/planning/runs/${runId}/results`, { params }).then(r => r.data as { run: PlanningRunHeader; rows: RunResult[] }),
});
export const useRunProposal = (runId: string | null) => useQuery({
  queryKey: ['planning', 'runs', runId, 'proposal'], enabled: !!runId,
  queryFn: () => api.get(`/planning/runs/${runId}/proposal`).then(r => r.data as ProposalGroup[]),
});
export const useCreateRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) => api.post('/planning/runs', { notes }).then(r => r.data as PlanningRunHeader),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'runs'] }); },
  });
};
export const useApproveRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/planning/runs/${id}/approve`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'runs'] }); },
  });
};
export const useOrderFromRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, supplierId, overrides }: { runId: string; supplierId: string | null; overrides: { sku: string; qty: number; reason?: string }[] }) =>
      api.post(`/planning/runs/${runId}/purchase-orders`, { supplierId, overrides }).then(r => r.data as PurchaseOrder),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'purchaseOrders'] }); },
  });
};
export const usePurchaseOrderAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'approve' | 'send' | 'cancel' | 'receive'; body?: Record<string, unknown> }) =>
      api.post(`/planning/purchase-orders/${id}/${action}`, body ?? {}).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'purchaseOrders'] }); qc.invalidateQueries({ queryKey: ['stock'] }); },
  });
};
export const useUpdateDraftOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/planning/purchase-orders/${id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'purchaseOrders'] }); },
  });
};
export const runExportUrl = (runId: string) => `${api.defaults.baseURL ?? ''}/planning/runs/${runId}/export`;

// Planning (Fase 2): store replenishment
export type StoreState = 'ENVIAR' | 'FALTANTE_SIN_RESPALDO' | 'RETIRO' | 'SOBRE_STOCK' | 'OK' | 'SIN_IDEAL';
export interface StorePlanRow {
  sku: string; name: string; category: string; abc: 'A' | 'B' | 'C'; dailyDemand: number; sigmaDaily: number;
  ideal: number; idealSource: 'manual' | 'computed' | 'none'; displayMin: number; stockStore: number; inTransit: number; availableSource: number;
  need: number; send: number; withdraw: number; coverageDays: number | null; state: StoreState; reasons: string[];
}
export interface StorePlan {
  store: string; source: string; asOf: string;
  params: { cycleDays: number; deliveryDays: number; demandWindowDays: number; splitDeliveryUnits: number; withdrawAfterMonths: number };
  summary: Record<string, number> & { deliveries: number }; rows: StorePlanRow[];
}
export interface TransferLine { sku: string; name: string; qtySuggested: number; qtyApproved: number; qtyDelivered: number; reason: string; snapshot: { ideal: number; stockStore: number; inTransit: number; availableSource: number; idealSource: string } }
export interface TransferOrder {
  _id: string; number: string; direction: 'send' | 'withdraw'; fromWarehouse: string; toWarehouse: string;
  status: 'draft' | 'approved' | 'picking' | 'delivered' | 'cancelled'; lines: TransferLine[]; pickingOrderNumber: string | null; notes: string; createdAt: string; deliveredAt: string | null;
}
export const useStores = () => useQuery({ queryKey: ['planning', 'stores'], queryFn: () => api.get('/planning/store/stores').then(r => r.data as { store: string; source: string }[]) });
export const useStorePlan = (store: string | null) => useQuery({
  queryKey: ['planning', 'storePlan', store], enabled: !!store,
  queryFn: () => api.get('/planning/store/plan', { params: { store } }).then(r => r.data as StorePlan),
});
export const useUpsertIdeals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ store, rows }: { store: string; rows: { sku: string; ideal: number | null; displayMin?: number; notes?: string }[] }) =>
      api.post('/planning/store/ideals', { rows }, { params: { store } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'storePlan'] }); },
  });
};
export const useTransfers = (store: string | null) => useQuery({
  queryKey: ['planning', 'transfers', store], queryFn: () => api.get('/planning/store/transfers', { params: { store } }).then(r => r.data as TransferOrder[]),
});
export const useCreateTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ store, direction, overrides }: { store: string; direction: 'send' | 'withdraw'; overrides: { sku: string; qty: number; reason?: string }[] }) =>
      api.post('/planning/store/transfers', { direction, overrides }, { params: { store } }).then(r => r.data as TransferOrder),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'transfers'] }); },
  });
};
export const useTransferAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deliver' | 'cancel' }) => api.post(`/planning/store/transfers/${id}/${action}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'transfers'] }); qc.invalidateQueries({ queryKey: ['planning', 'storePlan'] }); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['stock'] }); },
  });
};

// Planning (Fase 3): recipes and production
export type Uom = 'un' | 'kg' | 'm';
export interface RecipeComponent { sku: string; name: string; qty: number; uom: Uom; scrapPct: number | null }
export interface BomRecipe { _id: string; parentSku: string; name: string; version: number; isActive: boolean; components: RecipeComponent[]; notes: string; setBy: string; updatedAt: string }
export interface MaterialRequirement {
  sku: string; name: string; uom: Uom; required: number; level: number; from: { parentSku: string; qty: number }[];
  available: number; onOrder: number; shortage: number;
}
export interface ProductionPlan {
  runNumber: string | null; workshops: string[]; productionWarehouses: string[];
  candidates: { sku: string; name: string; category: string; state: string; suggested: number; hasRecipe: boolean; recipeVersion: number | null }[];
  requests: { sku: string; qty: number }[];
  materials: MaterialRequirement[];
  intermediates: Omit<MaterialRequirement, 'available' | 'onOrder' | 'shortage'>[];
  missingRecipes: string[];
  summary: { products: number; units: number; materials: number; shortages: number; kgDown: number; kgFeathers: number };
}
export interface ProductionOrder {
  _id: string; number: string; workshop: string; destinationWarehouse: string;
  status: 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  lines: { sku: string; name: string; qty: number; qtyProduced: number; recipeVersion: number; reason: string }[];
  materials: { sku: string; name: string; uom: Uom; required: number; available: number; consumed: number }[];
  producedLots: string[]; notes: string; createdAt: string; completedAt: string | null;
}
export const useRecipes = () => useQuery({ queryKey: ['planning', 'recipes'], queryFn: () => api.get('/planning/production/recipes').then(r => r.data as BomRecipe[]) });
export const useSaveRecipe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { parentSku: string; name?: string; components: { sku: string; qty: number; uom: Uom; scrapPct?: number | null }[]; notes?: string }) =>
      api.post('/planning/production/recipes', data).then(r => r.data as BomRecipe),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'recipes'] }); qc.invalidateQueries({ queryKey: ['planning', 'productionPlan'] }); },
  });
};
export const useDeactivateRecipe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parentSku: string) => api.post(`/planning/production/recipes/${encodeURIComponent(parentSku)}/deactivate`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'recipes'] }); qc.invalidateQueries({ queryKey: ['planning', 'productionPlan'] }); },
  });
};
export const useProductionPlan = (requests: { sku: string; qty: number }[] | null) => useQuery({
  queryKey: ['planning', 'productionPlan', requests],
  queryFn: () => api.post('/planning/production/plan', requests ? { requests } : {}).then(r => r.data as ProductionPlan),
});
export const useProductionOrders = () => useQuery({ queryKey: ['planning', 'productionOrders'], queryFn: () => api.get('/planning/production/orders').then(r => r.data as ProductionOrder[]) });
export const useCreateProductionOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { workshop: string; destinationWarehouse?: string; lines: { sku: string; qty: number; reason?: string }[]; notes?: string }) =>
      api.post('/planning/production/orders', data).then(r => r.data as ProductionOrder),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'productionOrders'] }); },
  });
};
export const useProductionOrderAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'approve' | 'start' | 'complete' | 'cancel'; body?: Record<string, unknown> }) =>
      api.post(`/planning/production/orders/${id}/${action}`, body ?? {}).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'productionOrders'] }); qc.invalidateQueries({ queryKey: ['planning', 'productionPlan'] }); qc.invalidateQueries({ queryKey: ['stock'] }); },
  });
};

// Planning (Fase 4): parameters, demand events, projects, accuracy, KPIs and alerts
export interface PlanningParams {
  version: number; projectMinUnits: number; projectOffices: string[]; companyRutMin: number; companyRutMax: number; outlierPercentile: number;
  baseWeight12m: number; growthDefault: number; growthByCategory: Record<string, number>; seasonalFactors: Record<string, number>;
  yoyAlertPct: number; yoyMultiplierEnabled: boolean; ssMonthsImported: number; ssMonthsNational: number; zByClass: Record<string, number>;
  reviewDays: number; nationalLeadTimeDays: number; moqMaxCoverageMonths: number; overstockExtraMonths: number; phaseOutMonths: number; newSkuMonths: number;
  storeCycleDays: number; storeDeliveryDays: number; storeDisplayMin: Record<string, number>; storeDemandWindowDays: number; storeSplitDeliveryUnits: number;
  scrapPct: number; changedBy: string; changeNote: string; createdAt: string;
}
export type PlanningParamsPatch = Partial<Omit<PlanningParams, 'version' | 'changedBy' | 'createdAt'>>;
export const usePlanningParams = () => useQuery({ queryKey: ['planning', 'params'], queryFn: () => api.get('/planning/params').then(r => r.data as PlanningParams) });
export const usePlanningParamsHistory = () => useQuery({ queryKey: ['planning', 'params', 'history'], queryFn: () => api.get('/planning/params/history').then(r => r.data as PlanningParams[]) });
export const useUpdatePlanningParams = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PlanningParamsPatch) => api.patch('/planning/params', patch).then(r => r.data as PlanningParams),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'params'] }); },
  });
};

export interface DemandEvent {
  _id: string; name: string; from: string; to: string; categories: string[]; skus: string[]; uplift: number;
  source: 'history' | 'manual'; isActive: boolean; notes: string;
}
export type DemandEventInput = Omit<DemandEvent, '_id' | 'source'>;
export const useDemandEvents = () => useQuery({ queryKey: ['planning', 'events'], queryFn: () => api.get('/planning/events').then(r => r.data as DemandEvent[]) });
export const useSaveDemandEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<DemandEventInput> }) =>
      (id ? api.patch(`/planning/events/${id}`, data) : api.post('/planning/events', data)).then(r => r.data as DemandEvent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'events'] }); },
  });
};
export const useDeleteDemandEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/planning/events/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'events'] }); },
  });
};

export type ProjectStatus = 'quote' | 'confirmed' | 'delivered' | 'cancelled';
export interface ProjectLine { sku: string; name: string; qty: number }
export interface ProjectDemand {
  _id: string; number: string; customer: string; rut: string | null; status: ProjectStatus; requiredDate: string | null; warehouse: string;
  lines: ProjectLine[]; orderId: string | null; orderNumber: string | null; notes: string; createdAt: string;
}
export interface ProjectCoverageLine { sku: string; qty: number; available: number; inTransit: number; covered: boolean }
export interface ProjectsResponse { items: ProjectDemand[]; coverage: Record<string, ProjectCoverageLine[]> }
export interface ProjectInput { customer: string; rut?: string; requiredDate?: string; warehouse?: string; lines: { sku: string; qty: number }[]; notes?: string }
export const useProjects = () => useQuery({ queryKey: ['planning', 'projects'], queryFn: () => api.get('/planning/projects').then(r => r.data as ProjectsResponse) });
export const useSaveProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<ProjectInput> }) =>
      (id ? api.patch(`/planning/projects/${id}`, data) : api.post('/planning/projects', data)).then(r => r.data as ProjectDemand),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'projects'] }); },
  });
};
export const useProjectAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'confirm' | 'deliver' | 'cancel' }) => api.post(`/planning/projects/${id}/${action}`).then(r => r.data as ProjectDemand),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'projects'] }); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['stock'] }); qc.invalidateQueries({ queryKey: ['planning', 'kpis'] }); },
  });
};

export interface AccuracyMetric { month: string; runNumber: string; group: string; skus: number; forecast: number; actual: number; wape: number | null; bias: number | null }
export const useForecastAccuracy = (groupBy: 'abc' | 'origin' | 'category') => useQuery({
  queryKey: ['planning', 'accuracy', groupBy],
  queryFn: () => api.get('/planning/accuracy', { params: { groupBy } }).then(r => r.data as AccuracyMetric[]),
});
export const useCloseMonths = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/planning/accuracy/close').then(r => r.data as { months: string[]; rows: number }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning', 'accuracy'] }); qc.invalidateQueries({ queryKey: ['planning', 'kpis'] }); },
  });
};

export interface PlanningKpis {
  run: { number: string; asOf: string; status: string } | null;
  forecast: { month: string; wape: number | null; bias: number | null; skus: number } | null;
  breaches: { ab: number; all: number; abSkus: { sku: string; name: string; abc: string }[] };
  overstock: { skus: number; units: number; value: number | null };
  deadStock: { skus: number; units: number; value: number | null };
  fillRate: { orders: number; requested: number; picked: number; pct: number | null };
  supplier: { linesWithEta: number; onTimePct: number | null };
  production: { orders: number; kgPlanned: number; kgConsumed: number };
  adoption: { orders: number; lines: number; changed: number; acceptedPct: number | null };
}
export interface PlanningAlert { type: string; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; sku?: string; ref?: string }
export const usePlanningKpis = () => useQuery({ queryKey: ['planning', 'kpis'], queryFn: () => api.get('/planning/kpis').then(r => r.data as PlanningKpis) });
export const useOperationalAlerts = () => useQuery({ queryKey: ['planning', 'kpis', 'alerts'], queryFn: () => api.get('/planning/alerts').then(r => r.data as PlanningAlert[]) });

// Planning · Sabanería (consumo de tela y cotizador)
export interface FabricSpec { _id: string; sku: string; name: string; rollWidthCm: number; selvageCm: number; directional: boolean; quality: string; bsaleVariantId: string | null; isActive: boolean; notes: string }
export interface SheetingTerm { var: string; coef: number }
export interface SheetingDimension { terms: SheetingTerm[]; const: number }
export interface SheetingPanel { role: string; count: number; width: SheetingDimension; length: SheetingDimension; mitred45: boolean; fabricSlot?: string }
export interface SheetingModel {
  _id: string; code: string; name: string; family: 'encimera' | 'bajera' | 'funda' | 'cubreplumon' | 'otro'; version: number; isActive: boolean;
  vars: Record<string, number>; panels: SheetingPanel[]; blocks: BlockRef[]; setBy: string; updatedAt: string; hems: Record<string, { cm: number; fold: 'simple' | 'doble' }>; cutBatchUnits: number;
  packagingClp: number; freightClp: number; validRange: Record<string, { min: number; max: number }>; sampleVars: Record<string, number>; notes: string;
  panelsText: { role: string; count: number; width: string; length: string; mitred45: boolean }[];
}
export interface WorkshopRate { _id: string; workshop: string; modelCode: string; sizeLabel: string | null; quality: string | null; rate: number; validFrom: string; validTo: string | null; version: number; isActive: boolean; notes: string }
export interface SheetingQuoteInput {
  modelCode: string; modelVersion?: number; fabricSku: string; frameFabricSku?: string; measures: Record<string, number>; qty: number;
  workshop: string; channel: string; sizeLabel?: string; cutBatchUnits?: number;
}
export interface SheetingFabricCost { sku: string; pricePerLinearMetre: number; costSource: 'bsale' | 'stale'; costSyncedAt: string | null; unit: 'ml' }
export interface SheetingQuoteFabric {
  slot: string; sku: string; name: string; rollWidthCm: number; usableWidthCm: number; directional: boolean;
  consumption: { linearMetresPerUnit: number; linearMetresWithScrapPerUnit: number; netAreaM2PerUnit: number; rollAreaM2PerUnit: number; wastePct: number };
  cost: SheetingFabricCost; fabricClp: number; theoreticalClp: number;
}
export interface SheetingQuote {
  model: { code: string; version: number; name: string; family: string };
  fabric: { sku: string; name: string; rollWidthCm: number; usableWidthCm: number; directional: boolean };
  fabrics: SheetingQuoteFabric[];
  measures: Record<string, number>; qty: number; workshop: string; channel: string; sizeLabel: string | null;
  pieces: { role: string; count: number; widthCm: number; lengthCm: number; mitred45: boolean; fabricSlot: string; fabricSku: string; orientation: 'al_hilo' | 'contrahilo'; piecesAcross: number; linearMetresPerUnit: number }[];
  consumption: { linearMetresPerUnit: number; linearMetresTotal: number; cuttingScrapPct: number; linearMetresWithScrapPerUnit: number; linearMetresWithScrapTotal: number; netAreaM2PerUnit: number; rollAreaM2PerUnit: number; wastePct: number; cutBatchUnits: number };
  fabricCost: SheetingFabricCost;
  cost: { fabric: number; labour: number; packaging: number; freight: number; supplies: number; total: number; totalQty: number };
  theoretical: { netAreaM2: number; pricePerM2: number; fabric: number; deltaPct: number };
  price: { marginFactor: number; netPvp: number; grossPvp: number; vatRate: number };
  supplies: { sku: string; name: string; qty: number; uom: string; unitCost: number | null; cost: number }[];
  labourRate: { rate: number; sizeLabel: string | null; quality: string | null; version: number };
  paramsVersion: number; warnings: string[];
}
/** Structured error the quote returns in `details` (see AllExceptionsFilter). */
export interface SheetingQuoteError {
  code: 'FABRIC_TOO_NARROW' | 'NO_WORKSHOP_RATE' | 'NO_FABRIC_COST' | 'MISSING_MEASURES' | 'IMPOSSIBLE_GEOMETRY';
  slot?: string; role?: string; requiredWidthCm?: number; availableWidthCm?: number;
  alternatives?: { sku: string; name: string; rollWidthCm: number }[];
  workshop?: string; modelCode?: string; sizeLabel?: string | null; quality?: string | null; sku?: string; missing?: string[];
}
export const useFabrics = () => useQuery({ queryKey: ['sheeting', 'fabrics'], queryFn: () => api.get('/planning/sheeting/fabrics').then(r => r.data as FabricSpec[]) });
export const useSheetingModels = () => useQuery({ queryKey: ['sheeting', 'models'], queryFn: () => api.get('/planning/sheeting/models').then(r => r.data as SheetingModel[]) });
export const useWorkshopRates = (workshop?: string) => useQuery({ queryKey: ['sheeting', 'rates', workshop], queryFn: () => api.get('/planning/sheeting/rates', { params: { workshop } }).then(r => r.data as WorkshopRate[]) });
/** Idempotent and side-effect free: safe to call on every keystroke (debounced). A 400 carries `details` with the reason. */
export const useSheetingQuote = (input: SheetingQuoteInput | null) => useQuery({
  queryKey: ['sheeting', 'quote', input],
  enabled: !!input,
  retry: false,
  placeholderData: (prev) => prev,
  queryFn: () => api.post('/planning/sheeting/quote', input).then(r => r.data as SheetingQuote),
});
export interface BlockParamSpec { name: string; type: 'number' | 'string' | 'boolean'; label: string; default?: number | string | boolean; unit?: string; hint?: string }
export interface BlockDef { name: string; label: string; description: string; params: BlockParamSpec[] }
export interface BlockRef { block: string; params: Record<string, number | string | boolean> }
export interface SheetingModelInput {
  code: string; name: string; family: SheetingModel['family']; blocks: BlockRef[]; vars?: Record<string, number>; hems?: SheetingModel['hems'];
  cutBatchUnits?: number; supplies?: { sku: string; name?: string; qty: number; uom: 'un' | 'kg' | 'm' }[]; validRange?: SheetingModel['validRange'];
  sampleVars?: Record<string, number>; packagingClp?: number; freightClp?: number; notes?: string;
}
export interface SheetingPreviewInput extends SheetingModelInput { fabricSku?: string; frameFabricSku?: string; measures?: Record<string, number>; workshop?: string; channel?: string; sizeLabel?: string }
export interface GeometryProblem { role: string; axis: 'width' | 'length'; valueCm: number; expression: string; at?: Record<string, number> }
export interface SheetingPreview {
  panels: SheetingPanel[]; vars: Record<string, number>; panelsText: SheetingModel['panelsText']; problems: GeometryProblem[]; sample: Record<string, number>;
  cut: { role: string; count: number; widthCm: number; lengthCm: number; mitred45: boolean; fabricSlot: string }[] | null;
  quote: SheetingQuote | null; quoteError: (SheetingQuoteError & { message?: string }) | null;
}
export const useBlockCatalogue = () => useQuery({ queryKey: ['sheeting', 'blocks'], queryFn: () => api.get('/planning/sheeting/blocks').then(r => r.data as BlockDef[]) });
export const useSheetingModelPreview = (input: SheetingPreviewInput | null) => useQuery({
  queryKey: ['sheeting', 'preview', input],
  enabled: !!input && input.blocks.length > 0,
  retry: false,
  placeholderData: (prev) => prev,
  queryFn: () => api.post('/planning/sheeting/models/preview', input).then(r => r.data as SheetingPreview),
});
export const useSaveSheetingModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SheetingModelInput) => api.post('/planning/sheeting/models', data).then(r => r.data as SheetingModel),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sheeting', 'models'] }); },
  });
};
export const useDuplicateSheetingModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, newCode, name }: { code: string; newCode: string; name?: string }) => api.post(`/planning/sheeting/models/${encodeURIComponent(code)}/duplicate`, { code: newCode, name }).then(r => r.data as SheetingModel),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sheeting', 'models'] }); },
  });
};
export const useSheetingModelsAll = () => useQuery({ queryKey: ['sheeting', 'models', 'all'], queryFn: () => api.get('/planning/sheeting/models', { params: { all: 'true' } }).then(r => r.data as SheetingModel[]) });

export interface SavedSheetingQuote {
  _id: string; number: string; productSku: string | null; productName: string; modelCode: string; modelVersion: number; fabricSku: string; frameFabricSku: string | null;
  input: SheetingQuoteInput; result: SheetingQuote; paramsVersion: number; costSource: 'bsale' | 'stale'; costSyncedAt: string | null;
  bomRecipeId: string | null; bomRecipeVersion: number | null; setBy: string; notes: string; createdAt: string;
}
export const useSheetingQuotes = (params?: { modelCode?: string; productSku?: string; frozen?: boolean; limit?: number }) => useQuery({
  queryKey: ['sheeting', 'quotes', params],
  queryFn: () => api.get('/planning/sheeting/quotes', { params }).then(r => r.data as SavedSheetingQuote[]),
});
export const useSaveSheetingQuote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SheetingQuoteInput & { productSku?: string; notes?: string }) => api.post('/planning/sheeting/quotes', data).then(r => r.data as SavedSheetingQuote),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sheeting', 'quotes'] }); qc.invalidateQueries({ queryKey: ['sheeting', 'models'] }); },
  });
};
export const useFreezeSheetingQuote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/planning/sheeting/quotes/${id}/freeze`).then(r => r.data as { recipeId: string; recipeVersion: number; created: boolean }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sheeting', 'quotes'] }); qc.invalidateQueries({ queryKey: ['planning', 'recipes'] }); },
  });
};
