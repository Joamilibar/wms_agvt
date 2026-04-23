import { useNavigate } from 'react-router';
import {
  HiOutlineChartBar,
  HiOutlineCube,
  HiOutlineClipboardList,
  HiOutlineClock,
  HiOutlineArrowLeft,
} from 'react-icons/hi';

// ── Each analysis tool card ───────────────────────────────────────────────────
const tools: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  to?: string;        // future pages add a `to` value
  badge?: string;
  disabled?: boolean;
}[] = [
  {
    icon: HiOutlineChartBar,
    label: 'Análisis ABC',
    description: 'Clasifica productos por rotación e impacto económico (A, B, C).',
    to: '/abc',
  },
  {
    icon: HiOutlineCube,
    label: 'Cobertura de Stock',
    description: 'Días de inventario disponible por SKU según ventas históricas.',
    to: '/cobertura',
  },
  {
    icon: HiOutlineClock,
    label: 'Aging de Inventario',
    description: 'Antigüedad de lotes y detección de productos sin movimiento.',
    to: '/aging',
  },
  {
    icon: HiOutlineClipboardList,
    label: 'Rotación de Productos',
    description: 'Velocidad de salida de cada SKU en el período seleccionado.',
    badge: 'Próximamente',
    disabled: true,
  },
  {
    icon: HiOutlineChartBar,
    label: 'Rentabilidad por SKU',
    description: 'Margen estimado por producto cruzando costo y precio BSale.',
    badge: 'Próximamente',
    disabled: true,
  },
];

export default function AnalisisInventario() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Análisis de Inventario</h1>
        <p className="text-sm text-text-muted mt-1">
          Herramientas de inteligencia para la gestión y optimización de tu inventario.
        </p>
      </div>

      {/* Tool grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {tools.map((tool) => (
          <button
            key={tool.label}
            onClick={() => !tool.disabled && tool.to && navigate(tool.to)}
            disabled={tool.disabled}
            className={`
              group relative text-left p-5 rounded-xl border transition-all duration-200
              ${tool.disabled
                ? 'border-border-primary bg-bg-tertiary/30 opacity-50 cursor-not-allowed'
                : 'border-border-primary bg-bg-secondary hover:border-brand-blue/50 hover:bg-bg-tertiary cursor-pointer hover:shadow-lg hover:shadow-brand-blue/5'}
            `}
          >
            {/* Badge */}
            {tool.badge && (
              <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-purple/15 text-brand-purple border border-brand-purple/20">
                {tool.badge}
              </span>
            )}

            <div className="flex items-start gap-4">
              <div className={`
                p-2.5 rounded-lg shrink-0
                ${tool.disabled ? 'bg-bg-tertiary' : 'bg-brand-blue/10 group-hover:bg-brand-blue/20 transition-colors'}
              `}>
                <tool.icon className={`w-5 h-5 ${tool.disabled ? 'text-text-muted' : 'text-brand-blue'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">{tool.label}</p>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">{tool.description}</p>
              </div>
            </div>

            {/* Arrow indicator */}
            {!tool.disabled && (
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-brand-blue text-xs">→</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <hr className="border-border-primary mb-6" />

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-primary text-sm text-text-secondary hover:text-text-primary hover:border-border-secondary hover:bg-bg-tertiary transition-all"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        Volver al Inicio
      </button>
    </div>
  );
}
