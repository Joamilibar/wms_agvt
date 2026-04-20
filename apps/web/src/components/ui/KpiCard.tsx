interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'green' | 'blue' | 'amber' | 'red' | 'purple';
}

const colorMap = {
  green: 'from-brand-green/20 to-brand-green/5 border-brand-green/30',
  blue: 'from-brand-blue/20 to-brand-blue/5 border-brand-blue/30',
  amber: 'from-brand-amber/20 to-brand-amber/5 border-brand-amber/30',
  red: 'from-brand-red/20 to-brand-red/5 border-brand-red/30',
  purple: 'from-brand-purple/20 to-brand-purple/5 border-brand-purple/30',
};

const iconColorMap = {
  green: 'text-brand-green',
  blue: 'text-brand-blue',
  amber: 'text-brand-amber',
  red: 'text-brand-red',
  purple: 'text-brand-purple',
};

export default function KpiCard({ title, value, subtitle, icon, color = 'blue' }: KpiCardProps) {
  return (
    <div className={`
      relative overflow-hidden rounded-xl border bg-gradient-to-br p-5
      ${colorMap[color]}
      transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20
    `}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`${iconColorMap[color]} opacity-60`}>{icon}</div>
        )}
      </div>
    </div>
  );
}
