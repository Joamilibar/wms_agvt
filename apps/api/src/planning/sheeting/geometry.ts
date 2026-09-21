/**
 * The geometry vocabulary of a sheeting model.
 *
 * A panel is a rectangle whose two dimensions are linear expressions over
 * named variables (`Σ coef·var + const`). That is enough for the whole
 * product line — everything is adding, subtracting and doubling measures —
 * and in exchange it is serialisable, editable on screen, testable and
 * safe: no `eval`, no formulas as text in the database.
 *
 * Pure and dependency-free like `nesting.ts`. `nesting.ts` and the calc
 * service only ever see `PanelSpec`; the block compiler that produces them
 * lives apart and is not on the calculation path.
 */

export interface Term {
  var: string;
  coef: number;
}

/** Σ coef·var + const, in centimetres. */
export interface Dimension {
  terms: Term[];
  const: number;
}

export interface PanelSpec {
  /** Informative label: 'centro', 'marco_ancho', 'traslape'… */
  role: string;
  /** How many identical pieces. */
  count: number;
  width: Dimension;
  length: Dimension;
  /** The mitre allowance is already inside `length`; this tells the workshop how to cut. */
  mitred45: boolean;
}

export type Vars = Record<string, number>;

export class MissingVariableError extends Error {
  constructor(public readonly variable: string) {
    super(`Variable sin valor: ${variable}`);
  }
}

/** Evaluates a dimension: a dot product and a constant. Throws on an unknown variable rather than assuming 0. */
export function evalDimension(dim: Dimension, vars: Vars): number {
  let v = dim.const;
  for (const t of dim.terms) {
    const x = vars[t.var];
    if (x === undefined || Number.isNaN(x)) throw new MissingVariableError(t.var);
    v += t.coef * x;
  }
  return round(v);
}

/** Every variable a dimension reads. */
export function dimensionVars(dim: Dimension): string[] {
  return [...new Set(dim.terms.map((t) => t.var))];
}

export function panelVars(panels: PanelSpec[]): string[] {
  return [...new Set(panels.flatMap((p) => [...dimensionVars(p.width), ...dimensionVars(p.length)]))];
}

/** Builders that keep hand-written specs readable: `dim({ A: 1, F1: -2 }, 8)` reads as `A − 2F1 + 8`. */
export function dim(coefs: Record<string, number>, constant = 0): Dimension {
  return { terms: Object.entries(coefs).filter(([, c]) => c !== 0).map(([v, coef]) => ({ var: v, coef })), const: constant };
}

/** Adds a constant to a dimension (a hem, a seam) without touching its terms. */
export function addConst(d: Dimension, cm: number): Dimension {
  return { terms: d.terms.map((t) => ({ ...t })), const: round(d.const + cm) };
}

/** Sums two dimensions term by term, merging variables. */
export function addDimensions(a: Dimension, b: Dimension): Dimension {
  const coefs = new Map<string, number>();
  for (const t of [...a.terms, ...b.terms]) coefs.set(t.var, (coefs.get(t.var) ?? 0) + t.coef);
  return { terms: [...coefs].filter(([, c]) => c !== 0).map(([v, coef]) => ({ var: v, coef })), const: round(a.const + b.const) };
}

/** Canonical form: variables sorted, zero coefficients dropped. Two equal geometries compare equal. */
export function normalizeDimension(d: Dimension): Dimension {
  const merged = addDimensions(d, { terms: [], const: 0 });
  return { terms: merged.terms.sort((x, y) => x.var.localeCompare(y.var)), const: merged.const };
}

export function normalizePanel(p: PanelSpec): PanelSpec {
  return { role: p.role, count: p.count, width: normalizeDimension(p.width), length: normalizeDimension(p.length), mitred45: p.mitred45 };
}

/** Human-readable `A − 2F1 + 8`, for error messages and the screen. */
export function formatDimension(d: Dimension): string {
  const parts: string[] = [];
  for (const t of normalizeDimension(d).terms) {
    const abs = Math.abs(t.coef);
    const body = `${abs === 1 ? '' : trimNumber(abs)}${t.var}`;
    parts.push(parts.length === 0 ? (t.coef < 0 ? `−${body}` : body) : `${t.coef < 0 ? '−' : '+'} ${body}`);
  }
  if (d.const !== 0 || parts.length === 0) {
    const abs = Math.abs(d.const);
    parts.push(parts.length === 0 ? (d.const < 0 ? `−${trimNumber(abs)}` : trimNumber(abs)) : `${d.const < 0 ? '−' : '+'} ${trimNumber(abs)}`);
  }
  return parts.join(' ');
}

// ── hems ─────────────────────────────────────────────────────────────────────

export type HemFold = 'simple' | 'doble';
export type HemStitch = 'simple' | 'doble';

/**
 * A hem on one edge. A simple fold consumes `cm`; a double fold consumes
 * `2·cm`. The stitch is a make-up attribute — a double stitch only asks for
 * a minimum fold — and consumes nothing.
 */
export interface HemSpec {
  cm: number;
  fold: HemFold;
  stitch?: HemStitch;
}

export interface Hems {
  left?: HemSpec;
  right?: HemSpec;
  top?: HemSpec;
  bottom?: HemSpec;
}

/** Centimetres of fabric one hem takes. */
export function hemAllowanceCm(hem: HemSpec | undefined): number {
  if (!hem) return 0;
  return hem.fold === 'doble' ? 2 * hem.cm : hem.cm;
}

/** Fabric the hems take on each axis: width gets left + right, length gets top + bottom. */
export function hemAllowances(hems: Hems): { widthCm: number; lengthCm: number } {
  return {
    widthCm: round(hemAllowanceCm(hems.left) + hemAllowanceCm(hems.right)),
    lengthCm: round(hemAllowanceCm(hems.top) + hemAllowanceCm(hems.bottom)),
  };
}

// ── evaluation to cut sizes ──────────────────────────────────────────────────

export interface CutPiece {
  role: string;
  count: number;
  widthCm: number;
  lengthCm: number;
  mitred45: boolean;
}

/** Evaluates every panel of a model for concrete measures. */
export function evaluatePanels(panels: PanelSpec[], vars: Vars): CutPiece[] {
  return panels.map((p) => ({ role: p.role, count: p.count, widthCm: evalDimension(p.width, vars), lengthCm: evalDimension(p.length, vars), mitred45: p.mitred45 }));
}

export interface GeometryProblem {
  role: string;
  axis: 'width' | 'length';
  valueCm: number;
  expression: string;
}

/** Every dimension has to come out positive; a 30 cm frame on a 50 cm case leaves a negative centre. */
export function findGeometryProblems(panels: PanelSpec[], vars: Vars): GeometryProblem[] {
  const out: GeometryProblem[] = [];
  for (const p of panels) {
    for (const axis of ['width', 'length'] as const) {
      const v = evalDimension(p[axis], vars);
      if (v <= 0) out.push({ role: p.role, axis, valueCm: v, expression: formatDimension(p[axis]) });
    }
    if (p.count <= 0) out.push({ role: p.role, axis: 'width', valueCm: p.count, expression: 'count' });
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const trimNumber = (n: number) => String(round(n));
