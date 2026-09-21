import {
  dim, addConst, addDimensions, evalDimension, evaluatePanels, findGeometryProblems, formatDimension, hemAllowances, normalizePanel,
  MissingVariableError, PanelSpec,
} from './geometry.js';

describe('linear dimensions', () => {
  it('evaluates Σ coef·var + const', () => {
    expect(evalDimension(dim({ A: 1, F1: -2, s: 2 }, 0), { A: 255, F1: 15, s: 1 })).toBe(227);
    expect(evalDimension(dim({}, 42), {})).toBe(42);
  });

  it('refuses to guess a missing variable', () => {
    expect(() => evalDimension(dim({ A: 1 }), {})).toThrow(MissingVariableError);
  });

  it('adds constants and dimensions without losing terms', () => {
    const d = addConst(dim({ A: 1 }, 2), 6);
    expect(evalDimension(d, { A: 255 })).toBe(263);
    const sum = addDimensions(dim({ A: 1, H: 2 }), dim({ H: 2, T: 2 }, 1));
    expect(normalizePanel({ role: 'x', count: 1, width: sum, length: sum, mitred45: false }).width).toEqual({ terms: [{ var: 'A', coef: 1 }, { var: 'H', coef: 4 }, { var: 'T', coef: 2 }], const: 1 });
  });

  it('prints like a person writes it', () => {
    expect(formatDimension(dim({ A: 1, F1: -2, s: 2 }))).toBe('A − 2F1 + 2s');
    expect(formatDimension(dim({ L: 1 }, 19))).toBe('L + 19');
    expect(formatDimension(dim({}, 0))).toBe('0');
  });
});

describe('hems (spec invariant 7)', () => {
  it('7 · a double stitch consumes no fabric: same cm, single vs double stitch → same allowance', () => {
    const single = hemAllowances({ left: { cm: 4, fold: 'simple', stitch: 'simple' }, right: { cm: 4, fold: 'simple', stitch: 'simple' } });
    const double = hemAllowances({ left: { cm: 4, fold: 'simple', stitch: 'doble' }, right: { cm: 4, fold: 'simple', stitch: 'doble' } });
    expect(single).toEqual(double);
    expect(single.widthCm).toBe(8);
  });

  it('a double fold consumes twice the hem', () => {
    expect(hemAllowances({ top: { cm: 7.5, fold: 'doble' }, bottom: { cm: 4, fold: 'simple' } })).toEqual({ widthCm: 0, lengthCm: 19 });
  });
});

describe('panels (spec invariant 8)', () => {
  const s = 1;
  const F1 = 15;
  // A mitred frame strip: the side it dresses plus the frame width at each end.
  const stripAcross: PanelSpec = { role: 'marco_ancho', count: 2, width: dim({ F1: 1, s: 2 }), length: dim({ A: 1, F1: 2 }), mitred45: true };

  it('8 · the 45° mitre adds material at both ends: strip = side + 2 × frame width', () => {
    const [strip] = evaluatePanels([stripAcross], { A: 255, F1, s });
    expect(strip.lengthCm).toBe(255 + 2 * F1);
    expect(strip.widthCm).toBe(F1 + 2 * s);
    expect(strip.count).toBe(2);
    expect(strip.mitred45).toBe(true);
  });

  it('flags an impossible geometry per panel and axis instead of failing later', () => {
    const centre: PanelSpec = { role: 'centro', count: 1, width: dim({ A: 1, F1: -2, s: 2 }), length: dim({ L: 1, F1: -2, s: 2 }), mitred45: false };
    const problems = findGeometryProblems([centre], { A: 50, L: 70, F1: 30, s: 1 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ role: 'centro', axis: 'width', valueCm: -8, expression: 'A − 2F1 + 2s' });
    expect(findGeometryProblems([centre], { A: 255, L: 290, F1: 15, s: 1 })).toEqual([]);
  });
});
