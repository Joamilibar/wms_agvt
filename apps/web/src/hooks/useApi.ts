import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// Auth
export const useLogin = () => useMutation({
  mutationFn: (data: { email: string; password: string }) => api.post('/auth/login', data).then(r => r.data),
});

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
export const useABC = (warehouse?: string) => useQuery({
  queryKey: ['abc', warehouse],
  queryFn: () => api.get('/analytics/abc', { params: { warehouse } }).then(r => r.data),
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
