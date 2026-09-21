import { dim, Hems, PanelSpec } from './geometry.js';
import type { SheetingFamily, MeasureRange, BlockRef } from '../schemas/sheeting-model.schema.js';

/**
 * The models and fabrics that come preloaded, written by hand against
 * `Costos Actualizados para BSale 2026 (ACTUAL).xlsx` (sheet
 * `REV ADR  Sábanas y Fdas Tiendas`). The block compiler (step 7) is built
 * to reproduce exactly these `PanelSpec`s — that is what anchors its
 * vocabulary to numbers someone has checked.
 */

export interface ReferenceModel {
  code: string;
  name: string;
  family: SheetingFamily;
  vars: Record<string, number>;
  hems: Hems;
  blocks: BlockRef[];
  panels: PanelSpec[];
  cutBatchUnits: number;
  packagingClp: number;
  freightClp: number;
  validRange: Record<string, MeasureRange>;
  sampleVars: Record<string, number>;
  notes: string;
}

const simple = (cm: number) => ({ cm, fold: 'simple' as const });

// ── Encimera crucero (top sheet with a double-layer frame) ───────────────────
//
// How the workshop actually makes it (confirmed 21-09-2026), not how the
// costing sheet costs it:
//   - The finished A × L INCLUDES the frame. The frame runs on the top edge
//     and both sides (not the bottom), F = 15 cm wide.
//   - Each frame edge is ONE strip of (s + F + s) × 2 = 38 cm, folded in
//     two (front and back layers), mitred at 45° — so its length is the side
//     plus F at each end. Every sewn edge takes s = 2 cm (two 1 cm folds).
//   - The centre panel loses F on the three framed edges and takes s on every
//     edge: where it enters the frame and as the plain 2 cm hem at the bottom.
//   - The frame is white or coloured: its fabric can differ from the
//     centre's, with its own roll width and its own $/ml (`fabricSlot`).
//   SuperKing 300×290 → centro 274×279 · laterales 2 × (38 × 320) · superior 38 × 330
//
// The sheet (REV ADR) costs the same product as a single 308×309 panel plus
// a colour application that does not reduce the centre; that geometry is
// kept only as a documented comparison in the tests.
const ENCIMERA_HEMS: Hems = { bottom: simple(2) };

export const ENCIMERA_CRUCERO: ReferenceModel = {
  code: 'ENCIMERA_CRUCERO',
  name: 'Sábana encimera crucero',
  family: 'encimera',
  vars: { F: 15, s: 2 },
  hems: ENCIMERA_HEMS,
  blocks: [{ block: 'panel_simple', params: {} }, { block: 'marco', params: { F: 15, edges: 'top,left,right', layers: 2, mitred: true } }],
  panels: [
    { role: 'centro', count: 1, width: dim({ A: 1, F: -2, s: 2 }), length: dim({ L: 1, F: -1, s: 2 }), mitred45: false, fabricSlot: 'base' },
    { role: 'marco_lateral', count: 2, width: dim({ F: 2, s: 4 }), length: dim({ L: 1, F: 2 }), mitred45: true, fabricSlot: 'marco' },
    { role: 'marco_superior', count: 1, width: dim({ F: 2, s: 4 }), length: dim({ A: 1, F: 2 }), mitred45: true, fabricSlot: 'marco' },
  ],
  cutBatchUnits: 20,
  packagingClp: 2100, // sheet: 0.4668 × 4500 (Queen); varies ±40 by size
  freightClp: 727, // Costos fijos 2023 J19
  validRange: { A: { min: 90, max: 400 }, L: { min: 200, max: 320 } },
  sampleVars: { A: 255, L: 290 },
  notes: 'Marco F = 15 arriba y en los dos lados, tira única de 2(s+F+s) = 38 cm doblada en dos, inglete a 45° (tira = lado + 2F). Centro A − 2F + 2s × L − F + 2s (s = 2 en todo borde, también la basta inferior). El marco puede ir en otra tela (slot "marco").',
};

// ── Bajera elasticada ────────────────────────────────────────────────────────
//
// Spec formula: A + 2(H + T) + seam on each axis, with H the mattress height
// (a quote measure) and T the tuck under the mattress (model var, 10 cm).
//
// The sheet computes (A + caída + 16) × (L + caída) with caída = 80 (Single,
// Twin, Full) or 90 (Queen and up). That reproduces exactly with the
// "caída already doubled" reading — 2(H + T) = 80 → H = 30, 2(H + T) = 90 →
// H = 35 — plus the sheet's 16 cm "Costura + Merma" on the width and nothing
// on the length. Both extras are vars (`sw`, `sl`) so the workshop's answer
// changes data, not code. PENDING: confirm with the workshop (blocker 1).
//   Queen 155×200, H 35 → 261×290 · King 180×200 → 286×290 · SuperKing 200×200 → 306×290
export const BAJERA_ELASTICADA: ReferenceModel = {
  code: 'BAJERA_ELASTICADA',
  name: 'Sábana bajera elasticada completa',
  family: 'bajera',
  vars: { T: 10, sw: 16, sl: 0 },
  hems: {},
  blocks: [{ block: 'panel_simple', params: { role: 'unico', seamPerEdge: 0 } }, { block: 'caida_elastica', params: { T: 10, extraWidth: 16, extraLength: 0 } }],
  panels: [
    { role: 'unico', count: 1, width: dim({ A: 1, H: 2, T: 2, sw: 1 }), length: dim({ L: 1, H: 2, T: 2, sl: 1 }), mitred45: false },
  ],
  cutBatchUnits: 20,
  packagingClp: 1710, // sheet: 0.38 × 4500 (Queen)
  freightClp: 649, // Costos fijos 2023 J18
  validRange: { A: { min: 80, max: 220 }, L: { min: 180, max: 220 }, H: { min: 15, max: 50 } },
  sampleVars: { A: 155, L: 200, H: 35 },
  notes: 'Medidas del colchón. Ancho A + 2(H+T) + sw, largo L + 2(H+T) + sl. sw = 16 y sl = 0 reproducen la hoja (Costura + Merma 8+8 solo al ancho); T = 10 agarre. Pendiente confirmar con el taller si la caída 80/90 de la hoja es total o por lado.',
};

export const REFERENCE_MODELS: ReferenceModel[] = [ENCIMERA_CRUCERO, BAJERA_ELASTICADA];

// ── Fabrics ──────────────────────────────────────────────────────────────────

export interface ReferenceFabric {
  sku: string;
  name: string;
  rollWidthCm: number;
  selvageCm: number;
  directional: boolean;
  quality: string;
  notes: string;
}

export const REFERENCE_FABRICS: ReferenceFabric[] = [
  { sku: '63845371893523', name: 'Tela Algodón 500TC Blanca Ancho 305 cms', rollWidthCm: 305, selvageCm: 1, directional: false, quality: '500TC', notes: 'Rollo de la hoja REV ADR (O3 = 3,05).' },
  { sku: '62697042132311', name: 'Tela Algodón 500TC Blanca Ancho 310 cms', rollWidthCm: 310, selvageCm: 1, directional: false, quality: '500TC', notes: 'Es el rollo con stock (2.004 m). Pendiente: cuál de los dos es la 500TC vigente.' },
  { sku: '62697042141143', name: 'Tela Algodón 500TC Blanco Ancho 280 cms', rollWidthCm: 280, selvageCm: 1, directional: false, quality: '500TC', notes: '' },
  { sku: '77219257926914', name: 'Tela Algodón 800TC Blanca', rollWidthCm: 305, selvageCm: 1, directional: false, quality: '800TC', notes: 'Ancho según la hoja (O3 = 3,05); la ficha BSale no lo trae.' },
  { sku: '77219271596756', name: 'Tela Algodón 1600TC Blanca', rollWidthCm: 305, selvageCm: 1, directional: false, quality: '1600TC', notes: 'Ancho según la hoja (O3 = 3,05); la ficha BSale no lo trae.' },
  { sku: '63845371924907', name: 'Tela Lino Envejecido Blanco Ancho 290', rollWidthCm: 290, selvageCm: 1, directional: false, quality: 'Lino', notes: '' },
  { sku: '63845371934610', name: 'Tela Lino Envejecido Stone Ancho 290', rollWidthCm: 290, selvageCm: 1, directional: false, quality: 'Lino', notes: '' },
  { sku: '63845371958560', name: 'Tela Lino Envejecido Charcoal Ancho 290', rollWidthCm: 290, selvageCm: 1, directional: false, quality: 'Lino', notes: '' },
  { sku: '68209407889318', name: 'Tela Algodón 200TC Blanca Ancho 280 cms', rollWidthCm: 280, selvageCm: 1, directional: false, quality: '180H', notes: 'La hoja de lino la costea como "$ 180H" a 2,80 m de ancho.' },
];
