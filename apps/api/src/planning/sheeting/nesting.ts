/**
 * Nesting of one rectangular piece on a roll of fixed width.
 *
 * Pure and dependency-free on purpose: it is the heart of the fabric
 * calculation and has to be testable without Mongo, like `engine/mrp.ts`.
 *
 * Fabric is bought by the linear metre of a roll whose width is fixed, so
 * what is left across the width is paid for anyway. A Single and a King top
 * sheet both take one piece across a 305 cm roll and both advance the same
 * 3.09 m — the area they contain is irrelevant to what is bought.
 */

export type Orientation = 'al_hilo' | 'contrahilo';

export interface NestingResult {
  orientation: Orientation;
  /** Pieces side by side across the usable width. */
  piecesAcross: number;
  /** Roll length bought per unit, batch amortised. */
  linearMetresPerUnit: number;
  /** Roll area paid per unit (linear metres × full roll width). */
  rollAreaM2: number;
  /** Area of the piece itself. */
  netAreaM2: number;
  /** 1 − net / roll: what is paid and not used, per unit. */
  wastePct: number;
}

export interface NestingOptions {
  /** A fabric with a nap or a directional print cannot be turned; only `al_hilo` is tried. */
  directional?: boolean;
  /**
   * Units laid together in one cut. The last row across is paid in full,
   * so the batch amortises it: 20 units at 2 across need 10 rows, 21 need
   * 11. Omitted = ideal amortisation (`length / piecesAcross`).
   */
  batchUnits?: number;
  /**
   * Full roll width, for the waste figure. Defaults to the usable width;
   * pass the real width when the selvage is trimmed — that is what is paid.
   */
  rollWidthCm?: number;
}

function layout(across: number, advanceCm: number, netAreaM2: number, rollWidthCm: number, orientation: Orientation, batchUnits?: number): NestingResult {
  const rows = batchUnits && batchUnits > 0 ? Math.ceil(batchUnits / across) : null;
  const linearMetresPerUnit = rows ? (rows * advanceCm) / 100 / batchUnits! : advanceCm / 100 / across;
  const rollAreaM2 = linearMetresPerUnit * (rollWidthCm / 100);
  return {
    orientation,
    piecesAcross: across,
    linearMetresPerUnit: round(linearMetresPerUnit, 4),
    rollAreaM2: round(rollAreaM2, 4),
    netAreaM2: round(netAreaM2, 4),
    wastePct: round(1 - netAreaM2 / rollAreaM2, 4),
  };
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Evaluates both orientations and keeps the one that buys fewer metres.
 * `null` means the piece fits the roll in no orientation: the caller turns
 * that into `FABRIC_TOO_NARROW` — never a rounding, never a silent splice.
 *
 * - `al_hilo`: the piece's width crosses the roll, its length advances.
 * - `contrahilo`: the piece turned 90°.
 */
export function nestPiece(widthCm: number, lengthCm: number, usableWidthCm: number, opts: NestingOptions = {}): NestingResult | null {
  if (widthCm <= 0 || lengthCm <= 0 || usableWidthCm <= 0) return null;
  const rollWidthCm = opts.rollWidthCm ?? usableWidthCm;
  const netAreaM2 = (widthCm / 100) * (lengthCm / 100);
  const candidates: NestingResult[] = [];

  if (widthCm <= usableWidthCm) {
    candidates.push(layout(Math.floor(usableWidthCm / widthCm), lengthCm, netAreaM2, rollWidthCm, 'al_hilo', opts.batchUnits));
  }
  if (!opts.directional && lengthCm <= usableWidthCm) {
    candidates.push(layout(Math.floor(usableWidthCm / lengthCm), widthCm, netAreaM2, rollWidthCm, 'contrahilo', opts.batchUnits));
  }
  if (candidates.length === 0) return null;
  // Fewer metres wins; on a tie the grain direction is the natural cut.
  return candidates.reduce((best, c) => (c.linearMetresPerUnit < best.linearMetresPerUnit ? c : best));
}

/** The width a piece would need across the roll in its narrowest admissible orientation. */
export function requiredWidthCm(widthCm: number, lengthCm: number, directional = false): number {
  return directional ? widthCm : Math.min(widthCm, lengthCm);
}

export interface PieceToNest {
  role: string;
  count: number;
  widthCm: number;
  lengthCm: number;
}

export interface NestedPiece extends PieceToNest {
  nesting: NestingResult;
  /** Linear metres per finished unit for all `count` pieces of this role. */
  linearMetresPerUnit: number;
}

export type NestingFailure = { code: 'FABRIC_TOO_NARROW'; role: string; requiredWidthCm: number; availableWidthCm: number };

export interface NestingSummary {
  pieces: NestedPiece[];
  linearMetresPerUnit: number;
  netAreaM2PerUnit: number;
  rollAreaM2PerUnit: number;
  wastePct: number;
}

/**
 * Nests every piece of a product independently (no 2D packing across roles)
 * and adds them up per finished unit. Stops at the first piece that does not
 * fit: a product with one impossible piece is not costable.
 */
export function nestPieces(pieces: PieceToNest[], usableWidthCm: number, opts: NestingOptions = {}): NestingSummary | NestingFailure {
  const out: NestedPiece[] = [];
  for (const p of pieces) {
    // A batch of N units lays N × count pieces of this role together.
    const batch = opts.batchUnits ? opts.batchUnits * p.count : undefined;
    const nesting = nestPiece(p.widthCm, p.lengthCm, usableWidthCm, { ...opts, batchUnits: batch });
    if (!nesting) return { code: 'FABRIC_TOO_NARROW', role: p.role, requiredWidthCm: requiredWidthCm(p.widthCm, p.lengthCm, opts.directional), availableWidthCm: usableWidthCm };
    out.push({ ...p, nesting, linearMetresPerUnit: round(nesting.linearMetresPerUnit * p.count, 4) });
  }
  const linearMetresPerUnit = round(out.reduce((s, p) => s + p.linearMetresPerUnit, 0), 4);
  const netAreaM2PerUnit = round(out.reduce((s, p) => s + p.nesting.netAreaM2 * p.count, 0), 4);
  const rollAreaM2PerUnit = round(out.reduce((s, p) => s + p.nesting.rollAreaM2 * p.count, 0), 4);
  return { pieces: out, linearMetresPerUnit, netAreaM2PerUnit, rollAreaM2PerUnit, wastePct: rollAreaM2PerUnit > 0 ? round(1 - netAreaM2PerUnit / rollAreaM2PerUnit, 4) : 0 };
}
