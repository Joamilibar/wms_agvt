import { dim, addConst, hemAllowances, Hems, PanelSpec } from './geometry.js';
import type { SheetingFamily, MeasureRange } from '../schemas/sheeting-model.schema.js';

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
  panels: PanelSpec[];
  cutBatchUnits: number;
  packagingClp: number;
  freightClp: number;
  validRange: Record<string, MeasureRange>;
  sampleVars: Record<string, number>;
  notes: string;
}

const simple = (cm: number) => ({ cm, fold: 'simple' as const });

// ── Encimera (top sheet) ─────────────────────────────────────────────────────
//
// The sheet costs the top sheet as ONE panel: (A + 8) × (L + 15 + 4). The 8 is
// the two 4 cm side hems, the 15 is the top hem that makes the "crucero"
// border, the 4 the bottom hem. No seams: a single panel has none.
//   Queen 255×290 → 263×309 · King 280×290 → 288×309 · SuperKing 300×290 → 308×309
//
// The coloured "crucero" application the sheet adds on top (`A × 14` above,
// `L × 14` on each side, "Telas color") is NOT in this geometry: it does not
// reduce the centre and the spec's reference metres (3.09 ml Queen) exclude
// it. Pending decision — see the step-3 report.
const ENCIMERA_HEMS: Hems = { left: simple(4), right: simple(4), top: simple(15), bottom: simple(4) };
const encimeraHem = hemAllowances(ENCIMERA_HEMS);

export const ENCIMERA_CRUCERO: ReferenceModel = {
  code: 'ENCIMERA_CRUCERO',
  name: 'Sábana encimera crucero',
  family: 'encimera',
  vars: {},
  hems: ENCIMERA_HEMS,
  panels: [
    { role: 'centro', count: 1, width: addConst(dim({ A: 1 }), encimeraHem.widthCm), length: addConst(dim({ L: 1 }), encimeraHem.lengthCm), mitred45: false },
  ],
  cutBatchUnits: 20,
  packagingClp: 2100, // sheet: 0.4668 × 4500 (Queen); varies ±40 by size
  freightClp: 727, // Costos fijos 2023 J19
  validRange: { A: { min: 90, max: 400 }, L: { min: 200, max: 320 } },
  sampleVars: { A: 255, L: 290 },
  notes: 'Un panel: A + 8 (bastas laterales 4+4) × L + 19 (basta superior 15, inferior 4). Reproduce la hoja REV ADR. La aplicación de color del crucero (A×14 arriba, L×14 por lado) queda pendiente de decisión.',
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
