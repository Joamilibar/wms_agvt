export type BadgeVariant = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'gray';

/**
 * Status helpers, kept out of Badge.tsx so that file only exports a component —
 * mixing the two breaks Vite's fast refresh for every screen that imports it.
 */
export const statusVariant = (status: string): BadgeVariant => {
  const map: Record<string, BadgeVariant> = {
    pending: 'amber',
    in_progress: 'blue',
    completed: 'green',
    cancelled: 'red',
    partial: 'purple',
    unavailable: 'gray',
    draft: 'gray',
    emitted: 'blue',
    in_transit: 'purple',
    received: 'green',
    synced: 'green',
    error: 'red',
    not_applicable: 'gray',
    critico: 'red',
    alto: 'amber',
    normal: 'green',
    bajo: 'blue',
    sin_movimiento: 'gray',
    ok: 'green',
    medio: 'amber',
  };
  return map[status] || 'gray';
};

export const statusLabel = (status: string): string => {
  const map: Record<string, string> = {
    pending: 'Pendiente',
    in_progress: 'En Proceso',
    completed: 'Completado',
    cancelled: 'Cancelado',
    partial: 'Parcial',
    unavailable: 'Sin Stock',
    draft: 'Borrador',
    emitted: 'Emitida',
    in_transit: 'En Tránsito',
    received: 'Recibida',
    critico: 'Crítico',
    alto: 'Alto',
    normal: 'Normal',
    bajo: 'Bajo',
    sin_movimiento: 'Sin Movimiento',
    ok: 'OK',
    medio: 'Medio',
  };
  return map[status] || status;
};
