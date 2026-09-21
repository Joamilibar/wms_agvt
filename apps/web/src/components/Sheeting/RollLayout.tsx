interface Piece {
  role: string;
  count: number;
  widthCm: number;
  lengthCm: number;
  orientation: 'al_hilo' | 'contrahilo';
  piecesAcross: number;
}

const COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

/**
 * The lay-up on the roll, to scale: the roll runs horizontally, its width is
 * the vertical axis. Each role shows one row of pieces as they sit across
 * the usable width, in the orientation the nesting chose. What the
 * workshop looks at to know how to lay the fabric, and what makes a piece
 * that does not fit obvious.
 */
export function RollLayout({ rollWidthCm, usableWidthCm, pieces }: { rollWidthCm: number; usableWidthCm: number; pieces: Piece[] }) {
  // One row per role, laid one after the other along the roll.
  const rows = pieces.reduce<{ role: string; count: number; across: number; advance: number; n: number; offset: number }[]>((acc, p) => {
    const across = p.orientation === 'al_hilo' ? p.widthCm : p.lengthCm;
    const advance = p.orientation === 'al_hilo' ? p.lengthCm : p.widthCm;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].advance : 0;
    return [...acc, { role: p.role, count: p.count, across, advance, n: Math.max(1, Math.min(p.piecesAcross, p.count)), offset }];
  }, []);
  const totalAdvance = rows.reduce((s, r) => s + r.advance, 0) || 1;
  const W = 520;
  const scale = W / Math.max(totalAdvance, rollWidthCm);
  const H = rollWidthCm * scale;
  const selvage = ((rollWidthCm - usableWidthCm) / 2) * scale;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W + 60} ${H + 28}`} className="w-full max-w-[640px] max-h-56" role="img" aria-label="Tendido sobre el rollo">
        <rect x={0} y={0} width={W} height={H} fill="rgba(148,163,184,0.10)" stroke="rgba(148,163,184,0.5)" />
        <rect x={0} y={0} width={W} height={selvage} fill="rgba(148,163,184,0.25)" />
        <rect x={0} y={H - selvage} width={W} height={selvage} fill="rgba(148,163,184,0.25)" />
        <text x={W + 6} y={12} fontSize={10} fill="#94a3b8">{rollWidthCm} cm</text>
        <text x={W + 6} y={H} fontSize={10} fill="#94a3b8">rollo</text>
        {rows.map((r, i) => {
          const w = r.advance * scale;
          const h = r.across * scale;
          const x0 = r.offset * scale;
          return (
            <g key={r.role}>
              {Array.from({ length: r.n }).map((_, k) => (
                <rect key={k} x={x0 + 1} y={selvage + k * h + 1} width={Math.max(1, w - 2)} height={Math.max(1, h - 2)} fill={COLORS[i % COLORS.length]} fillOpacity={0.35} stroke={COLORS[i % COLORS.length]} />
              ))}
              <text x={x0 + 4} y={selvage + 12} fontSize={10} fill="#e2e8f0">{r.role} {r.across}×{r.advance}{r.count > r.n ? ` (×${r.count})` : ''}</text>
              <text x={x0 + 4} y={H + 20} fontSize={10} fill="#94a3b8">{(r.advance / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })} m →</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
