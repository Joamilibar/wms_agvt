import { nestPiece, nestPieces, requiredWidthCm } from './nesting.js';

// Reference roll from the specification: 305 cm wide, 1 cm selvage per side.
const ROLL = 305;
const USABLE = ROLL - 2;
const opts = { rollWidthCm: ROLL };

describe('nestPiece (spec invariants 1–6)', () => {
  it('1 · takes the orientation that buys fewer metres: Bajera Queen 261×290 → contrahilo, 2.61 ml', () => {
    const r = nestPiece(261, 290, USABLE, opts)!;
    expect(r.orientation).toBe('contrahilo');
    expect(r.piecesAcross).toBe(1);
    expect(r.linearMetresPerUnit).toBeCloseTo(2.61, 4);
    expect(r.wastePct).toBeCloseTo(0.049, 3);
  });

  it('2 · what does not fit fails: Encimera SuperKing 308×309 in a 305 roll → null (FABRIC_TOO_NARROW)', () => {
    expect(nestPiece(308, 309, USABLE, opts)).toBeNull();
    const failure = nestPieces([{ role: 'centro', count: 1, widthCm: 308, lengthCm: 309 }], USABLE, opts);
    expect(failure).toEqual({ code: 'FABRIC_TOO_NARROW', role: 'centro', requiredWidthCm: 308, availableWidthCm: USABLE });
  });

  it('3 · …and fits in the right roll: the same piece in a 310 roll → al hilo, 3.09 ml', () => {
    const r = nestPiece(308, 309, 310 - 2, { rollWidthCm: 310 })!;
    expect(r.orientation).toBe('al_hilo');
    expect(r.linearMetresPerUnit).toBeCloseTo(3.09, 4);
  });

  it('4 · consumption does not scale with size when one piece fits across: Single and King → both 3.09 ml', () => {
    const single = nestPiece(198, 309, USABLE, opts)!;
    const king = nestPiece(288, 309, USABLE, opts)!;
    expect(single.linearMetresPerUnit).toBeCloseTo(3.09, 4);
    expect(king.linearMetresPerUnit).toBeCloseTo(3.09, 4);
    // What changes is the waste, which is what the area-based costing hides.
    expect(single.wastePct).toBeCloseTo(0.351, 3);
    expect(king.wastePct).toBeCloseTo(0.056, 3);
  });

  it('5 · directional blocks the rotation: Bajera Queen with directional → al hilo, never contrahilo', () => {
    const r = nestPiece(261, 290, USABLE, { ...opts, directional: true })!;
    expect(r.orientation).toBe('al_hilo');
    expect(r.linearMetresPerUnit).toBeCloseTo(2.9, 4);
    // A directional piece wider than the roll in its only orientation fails even though it would fit turned.
    expect(nestPiece(310, 100, USABLE, { ...opts, directional: true })).toBeNull();
    expect(nestPiece(310, 100, USABLE, opts)).not.toBeNull();
    expect(requiredWidthCm(310, 100, true)).toBe(310);
    expect(requiredWidthCm(310, 100, false)).toBe(100);
  });

  it('6 · the batch amortises: two pieces across → half the metres per unit', () => {
    // Both pieces are 200 cm long, so turning them does not help.
    const one = nestPiece(200, 200, USABLE, { ...opts, batchUnits: 20 })!;
    const two = nestPiece(150, 200, USABLE, { ...opts, batchUnits: 20 })!;
    expect(one.piecesAcross).toBe(1);
    expect(two.piecesAcross).toBe(2);
    expect(two.linearMetresPerUnit).toBeCloseTo(one.linearMetresPerUnit / 2, 4);
    // An odd batch pays the last row in full: 21 units at 2 across are 11 rows.
    const odd = nestPiece(150, 200, USABLE, { ...opts, batchUnits: 21 })!;
    expect(odd.linearMetresPerUnit).toBeCloseTo((11 * 2) / 21, 4);
  });

  it('reference table: Queen/King top sheets and Queen/King/SuperKing fitted sheets', () => {
    const ref: [number, number, number, string, number][] = [
      [263, 309, 3.09, 'al_hilo', 0.138],
      [288, 309, 3.09, 'al_hilo', 0.056],
      [261, 290, 2.61, 'contrahilo', 0.049],
      [286, 290, 2.86, 'contrahilo', 0.049],
      [306, 290, 3.06, 'contrahilo', 0.049],
    ];
    for (const [w, l, ml, o, waste] of ref) {
      const r = nestPiece(w, l, USABLE, opts)!;
      expect(r.orientation).toBe(o);
      expect(r.linearMetresPerUnit).toBeCloseTo(ml, 4);
      expect(r.wastePct).toBeCloseTo(waste, 3);
    }
  });

  it('adds up the pieces of a product per finished unit', () => {
    const s = nestPieces([
      { role: 'frente', count: 1, widthCm: 55, lengthCm: 85 },
      { role: 'reverso', count: 1, widthCm: 55, lengthCm: 85 },
      { role: 'traslape', count: 1, widthCm: 55, lengthCm: 32 },
    ], USABLE, opts);
    if ('code' in s) throw new Error(s.code);
    expect(s.pieces).toHaveLength(3);
    expect(s.linearMetresPerUnit).toBeCloseTo(s.pieces.reduce((a, p) => a + p.linearMetresPerUnit, 0), 4);
    expect(s.wastePct).toBeGreaterThanOrEqual(0);
  });
});
