import { evaluatePanels, findGeometryProblems, panelVars } from './geometry.js';
import { nestPieces } from './nesting.js';
import { ENCIMERA_CRUCERO, BAJERA_ELASTICADA, REFERENCE_FABRICS, REFERENCE_MODELS } from './reference-models.js';

const cut = (model: typeof ENCIMERA_CRUCERO, measures: Record<string, number>) =>
  evaluatePanels(model.panels, { ...model.vars, ...measures });

describe('reference models against the costing sheet (REV ADR  Sábanas y Fdas Tiendas)', () => {
  it('encimera crucero: centre + three mitred double-layer frame strips, as the workshop makes it', () => {
    // A × L finished includes the frame (F 15, top and sides). s = 2 per sewn edge, b = 2 bottom hem.
    const sheet: [string, number, number, [number, number], [number, number], [number, number]][] = [
      //  size        A    L    centro      lateral ×2   superior ×1
      ['Single', 190, 290, [164, 279], [38, 320], [38, 220]],
      ['Queen', 255, 290, [229, 279], [38, 320], [38, 285]],
      ['King', 280, 290, [254, 279], [38, 320], [38, 310]],
      ['SuperKing', 300, 290, [274, 279], [38, 320], [38, 330]],
    ];
    for (const [, A, L, centro, lateral, superior] of sheet) {
      const [c, lat, sup] = cut(ENCIMERA_CRUCERO, { A, L });
      expect([c.widthCm, c.lengthCm]).toEqual(centro);
      expect([lat.widthCm, lat.lengthCm, lat.count, lat.mitred45, lat.fabricSlot]).toEqual([...lateral, 2, true, 'marco']);
      expect([sup.widthCm, sup.lengthCm, sup.count, sup.mitred45, sup.fabricSlot]).toEqual([...superior, 1, true, 'marco']);
      expect(c.fabricSlot).toBe('base');
    }
    expect(panelVars(ENCIMERA_CRUCERO.panels).sort()).toEqual(['A', 'F', 'L', 'b', 's']);
  });

  it('encimera: the costing sheet costs the same product as one 308×309 panel — kept as the comparison', () => {
    // (A + 8) × (L + 15 + 4): the SuperKing costed that way does not fit the 305 roll; the real centre does.
    const sheetPanel = nestPieces([{ role: 'hoja', count: 1, widthCm: 308, lengthCm: 309 }], 303, { rollWidthCm: 305 });
    expect(sheetPanel).toMatchObject({ code: 'FABRIC_TOO_NARROW' });
    const real = nestPieces(cut(ENCIMERA_CRUCERO, { A: 300, L: 290 }), 303, { rollWidthCm: 305, batchUnits: 20 });
    if ('code' in real) throw new Error(real.code);
    expect(real.pieces[0].nesting.orientation).toBe('contrahilo'); // 279 across, 2.74 m advance
    expect(real.pieces[0].linearMetresPerUnit).toBeCloseTo(2.74, 4);
  });

  it('bajera: (A + 2(H+T) + sw) × (L + 2(H+T) + sl) reproduces the sheet with the "caída doblada" reading', () => {
    // Sheet: (ancho + caída + 16) × (largo + caída); caída 80 → H 30, caída 90 → H 35, with T = 10.
    const sheet: [string, number, number, number, number, number][] = [
      ['Single', 90, 190, 30, 186, 270],
      ['Twin', 105, 200, 30, 201, 280],
      ['Full 135', 135, 200, 30, 231, 280],
      ['Queen', 155, 200, 35, 261, 290],
      ['King', 180, 200, 35, 286, 290],
      ['SuperKing', 200, 200, 35, 306, 290],
    ];
    for (const [, A, L, H, w, l] of sheet) {
      const [p] = cut(BAJERA_ELASTICADA, { A, L, H });
      expect([p.widthCm, p.lengthCm]).toEqual([w, l]);
    }
  });

  it('bajera: the pending reading ("caída por lado") is a data change, not a code change', () => {
    // If the workshop says 80/90 is per side, the same panel with sw = sl = 1 and H = caída − T gives:
    const perSide = { ...BAJERA_ELASTICADA.vars, sw: 1, sl: 1 };
    const [p] = evaluatePanels(BAJERA_ELASTICADA.panels, { ...perSide, A: 155, L: 200, H: 80 });
    expect([p.widthCm, p.lengthCm]).toEqual([155 + 180 + 1, 200 + 180 + 1]);
    // …and a Queen would no longer fit any roll in the catalogue — which is why this must be confirmed first.
    const widest = Math.max(...REFERENCE_FABRICS.map((f) => f.rollWidthCm - 2 * f.selvageCm));
    expect(p.widthCm).toBeGreaterThan(widest);
  });

  it('reference metres on the 305 roll: Queen crucero 3.58 · Queen/King/SuperKing bajera 2.61/2.86/3.06 contrahilo', () => {
    const roll = REFERENCE_FABRICS.find((f) => f.sku === '63845371893523')!;
    const usable = roll.rollWidthCm - 2 * roll.selvageCm;
    const nest = (pieces: ReturnType<typeof cut>) => nestPieces(pieces, usable, { rollWidthCm: roll.rollWidthCm });

    // Queen crucero: centre 229×279 contrahilo (2.29 m) + strips 38 wide, 7 across the 303 usable width.
    const enc = nest(cut(ENCIMERA_CRUCERO, { A: 255, L: 290 }));
    if ('code' in enc) throw new Error(enc.code);
    expect(enc.pieces[0].nesting.orientation).toBe('contrahilo');
    expect(enc.pieces[0].linearMetresPerUnit).toBeCloseTo(2.29, 4);
    expect(enc.pieces[1].nesting.piecesAcross).toBe(7); // laterals 320 long: al hilo, 7 across
    expect(enc.pieces[2].nesting.orientation).toBe('contrahilo'); // the 285 top strip turns across the roll: 0.38 m
    // 2.29 + 2 × 3.20/7 + 0.38 = 3.58 ml per unit, against the sheet's 3.09 for a single panel.
    expect(enc.linearMetresPerUnit).toBeCloseTo(2.29 + 2 * 3.2 / 7 + 0.38, 3);

    for (const [A, ml] of [[155, 2.61], [180, 2.86], [200, 3.06]] as const) {
      const b = nest(cut(BAJERA_ELASTICADA, { A, L: 200, H: 35 }));
      if ('code' in b) throw new Error(b.code);
      expect(b.linearMetresPerUnit).toBeCloseTo(ml, 4);
      expect(b.pieces[0].nesting.orientation).toBe('contrahilo');
      expect(b.wastePct).toBeCloseTo(0.049, 3);
    }

  });

  it('every preloaded model is well-formed on its sample measures', () => {
    for (const m of REFERENCE_MODELS) {
      expect(findGeometryProblems(m.panels, { ...m.vars, ...m.sampleVars })).toEqual([]);
      for (const v of panelVars(m.panels)) expect(v in m.vars || v in m.sampleVars).toBe(true);
    }
    expect(new Set(REFERENCE_FABRICS.map((f) => f.sku)).size).toBe(REFERENCE_FABRICS.length);
    // Two linen widths coexist; the width is data, never a constant.
    expect(new Set(REFERENCE_FABRICS.map((f) => f.rollWidthCm)).size).toBeGreaterThan(2);
  });
});
