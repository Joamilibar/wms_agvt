import type { BadgeVariant } from '../../lib/status';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
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
