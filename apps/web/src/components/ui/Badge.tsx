interface BadgeProps {
  label: string;
  variant?: 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'gray';
}

const variants = {
  green: 'bg-brand-green/15 text-brand-green border-brand-green/30',
  blue: 'bg-brand-blue/15 text-brand-blue border-brand-blue/30',
  amber: 'bg-brand-amber/15 text-brand-amber border-brand-amber/30',
  red: 'bg-brand-red/15 text-brand-red border-brand-red/30',
  purple: 'bg-brand-purple/15 text-brand-purple border-brand-purple/30',
  gray: 'bg-text-muted/15 text-text-muted border-text-muted/30',
};

export default function Badge({ label, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${variants[variant]}`}>
      {label}
    </span>
  );
}

// Status helpers
export const statusVariant = (status: string): BadgeProps['variant'] => {
  const map: Record<string, BadgeProps['variant']> = {
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
