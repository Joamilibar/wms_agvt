import { addDimensions, dim, Dimension, normalizePanel, PanelSpec } from './geometry.js';

/**
 * Blocks: the layer between the person and the linear expressions.
 *
 * A model is an ordered list of blocks with parameters. Compiling walks the
 * list and produces `PanelSpec[]`, which is what gets persisted and what the
 * calculation reads. The blocks are NOT executed at quote time: fixing a
 * block tomorrow must not silently change the geometry of models already
 * frozen into recipes and production orders.
 *
 * Every dimension stays a linear expression: blocks only add terms and
 * constants. `s` is the model's per-edge allowance (2 cm = two 1 cm folds)
 * and is a variable, never a literal.
 */

export type BlockParamValue = number | string | boolean;
export type BlockParams = Record<string, BlockParamValue>;

export interface BlockRef {
  block: string;
  params: BlockParams;
}

export interface BlockParamSpec {
  name: string;
  type: 'number' | 'string' | 'boolean';
  label: string;
  default?: BlockParamValue;
  unit?: string;
  hint?: string;
}

export interface BlockDef {
  name: string;
  label: string;
  description: string;
  params: BlockParamSpec[];
}

/** What the compiler carries from block to block. */
interface State {
  /** The main panel's finished extents so far (before allowances). Frames and elastic drops change them. */
  width: Dimension;
  length: Dimension;
  /** Allowance already added to the main panel on each axis (seams, hems). */
  widthAllowance: Dimension;
  lengthAllowance: Dimension;
  /** Panels produced so far; the main panel is index 0 when `panel_simple` was used. */
  panels: PanelSpec[];
  mainIndex: number | null;
  /** Variables the blocks introduce (F, T, O…) with the values given. */
  vars: Record<string, number>;
  /** Frames applied so far: the first uses `F`, the next `F2`, `F3`… */
  frames: number;
}

export class BlockError extends Error {
  constructor(public readonly block: string, message: string) {
    super(`${block}: ${message}`);
  }
}

const num = (p: BlockParams, k: string, d?: number): number => {
  const v = p[k];
  if (v === undefined || v === '') {
    if (d === undefined) throw new Error(`falta el parámetro ${k}`);
    return d;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) throw new Error(`${k} no es un número`);
  return n;
};
const bool = (p: BlockParams, k: string, d: boolean): boolean => (p[k] === undefined ? d : p[k] === true || p[k] === 'true');
const str = (p: BlockParams, k: string, d: string): string => (p[k] === undefined || p[k] === '' ? d : String(p[k]));

const EDGES = ['top', 'bottom', 'left', 'right'] as const;
type Edge = (typeof EDGES)[number];
const edgesOf = (p: BlockParams, k: string, d: string): Edge[] => {
  const list = str(p, k, d).split(',').map((x) => x.trim()).filter(Boolean) as Edge[];
  for (const e of list) if (!EDGES.includes(e)) throw new Error(`borde desconocido: ${e}`);
  return list;
};

/** The main panel's cut dimensions right now: extents + allowances. */
function mainDims(st: State): { width: Dimension; length: Dimension } {
  return { width: addDimensions(st.width, st.widthAllowance), length: addDimensions(st.length, st.lengthAllowance) };
}
function refreshMain(st: State) {
  if (st.mainIndex === null) return;
  const d = mainDims(st);
  st.panels[st.mainIndex] = { ...st.panels[st.mainIndex], width: d.width, length: d.length };
}
function needMain(st: State, block: string) {
  if (st.mainIndex === null) throw new BlockError(block, 'necesita un panel_simple antes');
}

type Apply = (st: State, p: BlockParams) => void;

const REGISTRY: { def: BlockDef; apply: Apply }[] = [
  {
    def: {
      name: 'panel_simple', label: 'Panel simple', description: 'Un panel del tamaño terminado A × L, con la costura/basta s en cada borde.',
      params: [
        { name: 'role', type: 'string', label: 'Nombre', default: 'centro' },
        { name: 'seamPerEdge', type: 'number', label: 'Bordes con s', default: 1, hint: '1 = cada borde suma s (cuatro bordes → 2s por eje); 0 = sin margen' },
        { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'base' },
      ],
    },
    apply: (st, p) => {
      if (st.mainIndex !== null) throw new Error('ya hay un panel principal');
      const k = num(p, 'seamPerEdge', 1);
      st.widthAllowance = dim({ s: 2 * k });
      st.lengthAllowance = dim({ s: 2 * k });
      st.panels.push({ role: str(p, 'role', 'centro'), count: 1, width: dim({}), length: dim({}), mitred45: false, fabricSlot: str(p, 'fabricSlot', 'base') });
      st.mainIndex = st.panels.length - 1;
      refreshMain(st);
    },
  },
  {
    def: {
      name: 'marco', label: 'Marco', description: 'Tiras de marco de ancho F en los bordes elegidos; el centro pierde F por borde enmarcado. La tira lleva s en cada borde cosido y, con inglete, F extra en cada extremo.',
      params: [
        { name: 'F', type: 'number', label: 'Ancho del marco', unit: 'cm', default: 15 },
        { name: 'edges', type: 'string', label: 'Bordes', default: 'top,bottom,left,right', hint: 'top, bottom, left, right separados por coma' },
        { name: 'layers', type: 'number', label: 'Capas', default: 2, hint: '2 = una tira doblada en dos (frente y reverso), 1 = tira simple' },
        { name: 'mitred', type: 'boolean', label: 'Inglete 45°', default: true },
        { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'marco' },
        { name: 'var', type: 'string', label: 'Variable', hint: 'Nombre de la variable del ancho (F por defecto; F2, F3… si hay más marcos)' },
      ],
    },
    apply: (st, p) => {
      needMain(st, 'marco');
      const F = num(p, 'F', 15);
      const edges = edgesOf(p, 'edges', 'top,bottom,left,right');
      const layers = num(p, 'layers', 2);
      const mitred = bool(p, 'mitred', true);
      const slot = str(p, 'fabricSlot', 'marco');
      st.frames++;
      const fVar = str(p, 'var', st.frames === 1 ? 'F' : `F${st.frames}`);
      // The strip width: layers × (s + F + s), on its own variable so two frames keep their own F.
      const stripWidth = dim({ [fVar]: layers, s: 2 * layers });
      const vertical = edges.filter((e) => e === 'left' || e === 'right');
      const horizontal = edges.filter((e) => e === 'top' || e === 'bottom');
      // Strips are cut from the current finished extents (before this frame shrinks them).
      if (vertical.length) {
        const length = mitred ? addDimensions(st.length, dim({ [fVar]: 2 })) : st.length;
        st.panels.push({ role: vertical.length === 2 ? `${roleBase(fVar)}_lateral` : `${roleBase(fVar)}_${vertical[0] === 'left' ? 'izq' : 'der'}`, count: vertical.length, width: stripWidth, length, mitred45: mitred, fabricSlot: slot });
      }
      if (horizontal.length) {
        const length = mitred ? addDimensions(st.width, dim({ [fVar]: 2 })) : st.width;
        st.panels.push({ role: horizontal.length === 2 ? `${roleBase(fVar)}_horizontal` : `${roleBase(fVar)}_${horizontal[0] === 'top' ? 'superior' : 'inferior'}`, count: horizontal.length, width: stripWidth, length, mitred45: mitred, fabricSlot: slot });
      }
      st.width = addDimensions(st.width, dim({ [fVar]: -vertical.length }));
      st.length = addDimensions(st.length, dim({ [fVar]: -horizontal.length }));
      st.vars[fVar] = F;
      refreshMain(st);
    },
  },
  {
    def: {
      name: 'marco_doble', label: 'Marco doble', description: 'Dos anillos concéntricos F1 (exterior) y F2 (interior); el centro encoge 2(F1+F2) por eje.',
      params: [
        { name: 'F1', type: 'number', label: 'Marco exterior', unit: 'cm', default: 15 },
        { name: 'F2', type: 'number', label: 'Marco interior', unit: 'cm', default: 5 },
        { name: 'edges', type: 'string', label: 'Bordes', default: 'top,bottom,left,right' },
        { name: 'layers', type: 'number', label: 'Capas', default: 2 },
        { name: 'mitred', type: 'boolean', label: 'Inglete 45°', default: true },
        { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'marco' },
      ],
    },
    apply: (st, p) => {
      const base = { edges: str(p, 'edges', 'top,bottom,left,right'), layers: num(p, 'layers', 2), mitred: bool(p, 'mitred', true), fabricSlot: str(p, 'fabricSlot', 'marco') };
      find('marco').apply(st, { ...base, F: num(p, 'F1', 15), var: 'F1' });
      find('marco').apply(st, { ...base, F: num(p, 'F2', 5), var: 'F2' });
    },
  },
  {
    def: {
      name: 'reverso', label: 'Reverso', description: 'Duplica el panel principal (frente y atrás de una funda).',
      params: [{ name: 'role', type: 'string', label: 'Nombre', default: 'reverso' }, { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'base' }],
    },
    apply: (st, p) => {
      needMain(st, 'reverso');
      const d = mainDims(st);
      st.panels.push({ role: str(p, 'role', 'reverso'), count: 1, width: d.width, length: d.length, mitred45: false, fabricSlot: str(p, 'fabricSlot', 'base') });
    },
  },
  {
    def: {
      name: 'traslape', label: 'Traslape', description: 'Un panel de O de alto al ancho del producto (la solapa de una funda).',
      params: [{ name: 'O', type: 'number', label: 'Alto del traslape', unit: 'cm', default: 30 }, { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'base' }],
    },
    apply: (st, p) => {
      needMain(st, 'traslape');
      st.vars.O = num(p, 'O', 30);
      st.panels.push({ role: 'traslape', count: 1, width: mainDims(st).width, length: dim({ O: 1, s: 2 }), mitred45: false, fabricSlot: str(p, 'fabricSlot', 'base') });
    },
  },
  {
    def: {
      name: 'caida_elastica', label: 'Caída elástica', description: 'Bajera: suma 2(H + T) a ambos ejes del panel (H = altura del colchón, medida de la cotización; T = agarre).',
      params: [
        { name: 'T', type: 'number', label: 'Agarre bajo el colchón', unit: 'cm', default: 10 },
        { name: 'extraWidth', type: 'number', label: 'Extra al ancho', unit: 'cm', default: 0, hint: 'Costura/merma adicional al ancho (la hoja usa 16)' },
        { name: 'extraLength', type: 'number', label: 'Extra al largo', unit: 'cm', default: 0 },
      ],
    },
    apply: (st, p) => {
      needMain(st, 'caida_elastica');
      st.vars.T = num(p, 'T', 10);
      st.vars.sw = num(p, 'extraWidth', 0);
      st.vars.sl = num(p, 'extraLength', 0);
      st.width = addDimensions(st.width, dim({ H: 2, T: 2 }));
      st.length = addDimensions(st.length, dim({ H: 2, T: 2 }));
      st.widthAllowance = addDimensions(st.widthAllowance, dim({ sw: 1 }));
      st.lengthAllowance = addDimensions(st.lengthAllowance, dim({ sl: 1 }));
      refreshMain(st);
    },
  },
  {
    def: {
      name: 'huincha', label: 'Huincha', description: 'Tiras perimetrales de ancho Hu (más s por borde) a lo largo de los cuatro lados.',
      params: [{ name: 'Hu', type: 'number', label: 'Ancho de la huincha', unit: 'cm', default: 26 }, { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'base' }],
    },
    apply: (st, p) => {
      needMain(st, 'huincha');
      st.vars.Hu = num(p, 'Hu', 26);
      const slot = str(p, 'fabricSlot', 'base');
      st.panels.push({ role: 'huincha_lateral', count: 2, width: dim({ Hu: 1, s: 2 }), length: st.length, mitred45: false, fabricSlot: slot });
      st.panels.push({ role: 'huincha_horizontal', count: 2, width: dim({ Hu: 1, s: 2 }), length: st.width, mitred45: false, fabricSlot: slot });
    },
  },
  {
    def: {
      name: 'basta', label: 'Basta', description: 'Suma tela por borde al panel principal sin crear paneles: simple = d, doble = 2d.',
      params: [
        { name: 'top', type: 'number', label: 'Arriba', unit: 'cm', default: 0 }, { name: 'bottom', type: 'number', label: 'Abajo', unit: 'cm', default: 0 },
        { name: 'left', type: 'number', label: 'Izquierda', unit: 'cm', default: 0 }, { name: 'right', type: 'number', label: 'Derecha', unit: 'cm', default: 0 },
        { name: 'fold', type: 'string', label: 'Doblez', default: 'simple', hint: 'simple o doble; la doble puntada no consume' },
      ],
    },
    apply: (st, p) => {
      needMain(st, 'basta');
      const k = str(p, 'fold', 'simple') === 'doble' ? 2 : 1;
      st.widthAllowance = addDimensions(st.widthAllowance, dim({}, k * (num(p, 'left', 0) + num(p, 'right', 0))));
      st.lengthAllowance = addDimensions(st.lengthAllowance, dim({}, k * (num(p, 'top', 0) + num(p, 'bottom', 0))));
      refreshMain(st);
    },
  },
  {
    def: {
      name: 'tira_libre', label: 'Tira libre', description: 'Un rectángulo cualquiera, para lo que no encaje en los otros bloques.',
      params: [
        { name: 'role', type: 'string', label: 'Nombre', default: 'tira' }, { name: 'w', type: 'number', label: 'Ancho', unit: 'cm' }, { name: 'l', type: 'number', label: 'Largo', unit: 'cm' },
        { name: 'count', type: 'number', label: 'Cantidad', default: 1 }, { name: 'fabricSlot', type: 'string', label: 'Tela', default: 'base' },
      ],
    },
    apply: (st, p) => {
      st.panels.push({ role: str(p, 'role', 'tira'), count: num(p, 'count', 1), width: dim({}, num(p, 'w')), length: dim({}, num(p, 'l')), mitred45: false, fabricSlot: str(p, 'fabricSlot', 'base') });
    },
  },
];

const roleBase = (fVar: string) => (fVar === 'F' ? 'marco' : `marco${fVar.slice(1)}`);
const find = (name: string) => {
  const b = REGISTRY.find((x) => x.def.name === name);
  if (!b) throw new BlockError(name, 'bloque desconocido');
  return b;
};

export interface Compiled {
  panels: PanelSpec[];
  /** Model variables the blocks set (F = 15, T = 10…); `s` must be supplied by the model. */
  vars: Record<string, number>;
}

/** The catalogue the screen builds from. */
export function blockCatalogue(): BlockDef[] {
  return REGISTRY.map((b) => b.def);
}

/**
 * Compiles an ordered list of blocks to panels. Deterministic: the same
 * blocks always give the same `PanelSpec[]`, normalised (sorted terms, no
 * zero coefficients), so a recompilation can be compared with what was
 * stored.
 */
export function compileBlocks(blocks: BlockRef[]): Compiled {
  const st: State = { width: dim({ A: 1 }), length: dim({ L: 1 }), widthAllowance: dim({}), lengthAllowance: dim({}), panels: [], mainIndex: null, vars: {}, frames: 0 };
  for (const ref of blocks) {
    const b = find(ref.block);
    try {
      b.apply(st, ref.params ?? {});
    } catch (e) {
      if (e instanceof BlockError) throw e;
      throw new BlockError(ref.block, (e as Error).message);
    }
  }
  return { panels: st.panels.map(normalizePanel), vars: st.vars };
}
