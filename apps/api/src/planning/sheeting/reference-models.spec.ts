import { evaluatePanels, findGeometryProblems, panelVars } from './geometry.js';
import { nestPieces } from './nesting.js';
import { ENCIMERA_CRUCERO, BAJERA_ELASTICADA, REFERENCE_FABRICS, REFERENCE_MODELS } from './reference-models.js';

const cut = (model: typeof ENCIMERA_CRUCERO, measures: Record<string, number>) =>
  evaluatePanels(model.panels, { ...model.vars, ...measures });

describe('reference models against the costing sheet (REV ADR  Sábanas y Fdas Tiendas)', () => {
  it('encimera: one panel (A + 8) × (L + 19), every size of the sheet', () => {
    const sheet: [string, number, number, number, number][] = [
      ['Single', 190, 290, 198, 309],
      ['Twin', 205, 290, 213, 309],
      ['Full 135', 230, 290, 238, 309],
      ['Queen', 255, 290, 263, 309],
      ['King', 280, 290, 288, 309],
      ['SuperKing', 300, 290, 308, 309],
    ];
    for (const [, A, L, w, l] of sheet) {
      const [p] = cut(ENCIMERA_CRUCERO, { A, L });
      expect([p.widthCm, p.lengthCm]).toEqual([w, l]);
    }
    expect(ENCIMERA_CRUCERO.panels).toHaveLength(1);
    expect(panelVars(ENCIMERA_CRUCERO.panels).sort()).toEqual(['A', 'L']);
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

  it('reference metres on the 305 roll: Queen encimera 3.09 al hilo · Queen/King/SuperKing bajera 2.61/2.86/3.06 contrahilo', () => {
    const roll = REFERENCE_FABRICS.find((f) => f.sku === '63845371893523')!;
    const usable = roll.rollWidthCm - 2 * roll.selvageCm;
    const nest = (pieces: ReturnType<typeof cut>) => nestPieces(pieces, usable, { rollWidthCm: roll.rollWidthCm });

    const enc = nest(cut(ENCIMERA_CRUCERO, { A: 255, L: 290 }));
    if ('code' in enc) throw new Error(enc.code);
    expect(enc.linearMetresPerUnit).toBeCloseTo(3.09, 4);
    expect(enc.pieces[0].nesting.orientation).toBe('al_hilo');
    expect(enc.wastePct).toBeCloseTo(0.138, 3);

    for (const [A, ml] of [[155, 2.61], [180, 2.86], [200, 3.06]] as const) {
      const b = nest(cut(BAJERA_ELASTICADA, { A, L: 200, H: 35 }));
      if ('code' in b) throw new Error(b.code);
      expect(b.linearMetresPerUnit).toBeCloseTo(ml, 4);
      expect(b.pieces[0].nesting.orientation).toBe('contrahilo');
      expect(b.wastePct).toBeCloseTo(0.049, 3);
    }

    // SuperKing encimera does not fit the 305 roll and the sheet costs it as if it did.
    const sk = nest(cut(ENCIMERA_CRUCERO, { A: 300, L: 290 }));
    expect(sk).toMatchObject({ code: 'FABRIC_TOO_NARROW', requiredWidthCm: 308, availableWidthCm: 303 });
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
