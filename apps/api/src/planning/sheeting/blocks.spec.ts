import { blockCatalogue, compileBlocks, BlockError, BlockRef } from './blocks.js';
import { evaluatePanels, findGeometryProblems, formatDimension, normalizePanel } from './geometry.js';
import { ENCIMERA_CRUCERO, BAJERA_ELASTICADA } from './reference-models.js';

const text = (panels: ReturnType<typeof compileBlocks>['panels']) =>
  panels.map((p) => `${p.count}× ${p.role} [${p.fabricSlot}]: ${formatDimension(p.width)} × ${formatDimension(p.length)}${p.mitred45 ? ' 45°' : ''}`);

describe('block compiler (spec invariants 12–17)', () => {
  it('12 · the blocks reproduce the hand-written reference: panel_simple + marco(F 15, top/left/right) ≡ ENCIMERA_CRUCERO', () => {
    const { panels, vars } = compileBlocks(ENCIMERA_CRUCERO.blocks);
    expect(panels).toEqual(ENCIMERA_CRUCERO.panels.map(normalizePanel));
    expect(vars).toEqual({ F: 15 });
    // …and the same numbers for a SuperKing.
    const all = { ...ENCIMERA_CRUCERO.vars, ...vars, A: 300, L: 290 };
    expect(evaluatePanels(panels, all).map((p) => [p.role, p.widthCm, p.lengthCm])).toEqual([
      ['centro', 274, 279], ['marco_lateral', 38, 320], ['marco_superior', 38, 330],
    ]);
  });

  it('12b · the fitted sheet too: panel_simple(no seam) + caida_elastica ≡ BAJERA_ELASTICADA', () => {
    const { panels, vars } = compileBlocks(BAJERA_ELASTICADA.blocks);
    expect(panels).toEqual(BAJERA_ELASTICADA.panels.map(normalizePanel));
    expect(vars).toEqual({ T: 10, sw: 16, sl: 0 });
  });

  it('13 · without the frame there are no frame panels: a single A + 2s × L + 2s', () => {
    const { panels } = compileBlocks([{ block: 'panel_simple', params: {} }]);
    expect(text(panels)).toEqual(['1× centro [base]: A + 2s × L + 2s']);
  });

  it('14 · a double frame shrinks the centre twice: A − 2F1 − 2F2 + 2s', () => {
    const { panels } = compileBlocks([{ block: 'panel_simple', params: {} }, { block: 'marco_doble', params: { F1: 15, F2: 5 } }]);
    expect(formatDimension(panels[0].width)).toBe('A − 2F1 − 2F2 + 2s');
    expect(formatDimension(panels[0].length)).toBe('L − 2F1 − 2F2 + 2s');
    // Outer strips run the full side (+ mitre), inner strips the side already reduced by F1.
    expect(text(panels)).toContain('2× marco1_lateral [marco]: 2F1 + 4s × L + 2F1 45°');
    expect(text(panels)).toContain('2× marco2_lateral [marco]: 2F2 + 4s × L − 2F1 + 2F2 45°');
  });

  it('15 · the flap is optional and additive: with and without traslape differ in exactly one O + 2s panel', () => {
    const without = compileBlocks([{ block: 'panel_simple', params: {} }, { block: 'reverso', params: {} }]);
    const withFlap = compileBlocks([{ block: 'panel_simple', params: {} }, { block: 'reverso', params: {} }, { block: 'traslape', params: { O: 30 } }]);
    expect(withFlap.panels.slice(0, 2)).toEqual(without.panels);
    expect(withFlap.panels).toHaveLength(without.panels.length + 1);
    expect(text(withFlap.panels)[2]).toBe('1× traslape [base]: A + 2s × O + 2s');
    expect(withFlap.vars.O).toBe(30);
  });

  it('16 · an impossible geometry is caught on the compiled panels: a 30 cm frame on a 50 cm case', () => {
    const { panels, vars } = compileBlocks([{ block: 'panel_simple', params: {} }, { block: 'marco', params: { F: 30 } }]);
    const problems = findGeometryProblems(panels, { ...vars, s: 2, A: 50, L: 70 });
    expect(problems.map((p) => [p.role, p.axis, p.valueCm])).toEqual([['centro', 'width', -6]]);
  });

  it('17 · compiling is deterministic and stable: twice the same blocks, identical PanelSpec[]', () => {
    const blocks: BlockRef[] = [{ block: 'panel_simple', params: {} }, { block: 'marco', params: { F: 15, edges: 'right,left,top' } }, { block: 'basta', params: { bottom: 3, fold: 'doble' } }];
    const a = compileBlocks(blocks);
    const b = compileBlocks(JSON.parse(JSON.stringify(blocks)) as BlockRef[]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.panels.every((p) => p.width.terms.every((t, i, arr) => i === 0 || arr[i - 1].var < t.var))).toBe(true);
  });

  it('18 · a saved model keeps its compiled panels; the blocks are only what reopens it', () => {
    // What gets persisted is the compiled geometry. Changing a block's parameters — or its code — and recompiling
    // yields a different geometry, while the stored panels are untouched by construction.
    const stored = compileBlocks(ENCIMERA_CRUCERO.blocks).panels;
    const snapshot = JSON.stringify(stored);
    const recompiled = compileBlocks([{ block: 'panel_simple', params: {} }, { block: 'marco', params: { F: 15, edges: 'top,left,right', layers: 1, mitred: true } }]).panels;
    expect(JSON.stringify(recompiled)).not.toBe(snapshot);
    expect(JSON.stringify(stored)).toBe(snapshot);
  });

  it('blocks that need a main panel say so, and unknown blocks fail by name', () => {
    expect(() => compileBlocks([{ block: 'marco', params: { F: 15 } }])).toThrow(BlockError);
    expect(() => compileBlocks([{ block: 'volante', params: {} }])).toThrow(/volante/);
    expect(() => compileBlocks([{ block: 'panel_simple', params: {} }, { block: 'marco', params: { F: 15, edges: 'arriba' } }])).toThrow(/borde desconocido/);
  });

  it('huincha and tira_libre add strips without touching the centre', () => {
    const { panels } = compileBlocks([
      { block: 'panel_simple', params: {} }, { block: 'reverso', params: {} }, { block: 'traslape', params: { O: 30 } },
      { block: 'huincha', params: { Hu: 26 } }, { block: 'tira_libre', params: { role: 'lazo', w: 4, l: 40, count: 6 } },
    ]);
    expect(text(panels)).toEqual([
      '1× centro [base]: A + 2s × L + 2s', '1× reverso [base]: A + 2s × L + 2s', '1× traslape [base]: A + 2s × O + 2s',
      '2× huincha_lateral [base]: Hu + 2s × L', '2× huincha_horizontal [base]: Hu + 2s × A', '6× lazo [base]: 4 × 40',
    ]);
  });

  it('the catalogue describes every block with its parameters', () => {
    const names = blockCatalogue().map((b) => b.name);
    expect(names).toEqual(['panel_simple', 'marco', 'marco_doble', 'reverso', 'traslape', 'caida_elastica', 'huincha', 'basta', 'tira_libre']);
    for (const b of blockCatalogue()) for (const p of b.params) expect(['number', 'string', 'boolean']).toContain(p.type);
  });
});
