import { Channel } from '../schemas/sales-history.schema.js';

export interface ChannelRule {
  projectOffices: string[];
  projectMinUnits: number;
  companyRutMin: number;
  companyRutMax: number;
}

/** Numeric body of a Chilean RUT ("76.637.140-K" → 76637140), or null if it is not one. */
export function rutNumber(rut: string | null | undefined): number | null {
  if (!rut) return null;
  const body = rut.replace(/\./g, '').split('-')[0].trim();
  if (!/^\d{6,9}$/.test(body)) return null;
  return Number(body);
}

export function isCompanyRut(rut: string | null | undefined, rule: ChannelRule): boolean {
  const n = rutNumber(rut);
  return n !== null && n >= rule.companyRutMin && n < rule.companyRutMax;
}

/**
 * The channel of a document (D1). Decided per document, never per SKU: a
 * hotel-line pillowcase sold over the counter is retail, and 3.200 slippers
 * invoiced to a hotel from the web warehouse are a project.
 */
export function classifyDocument(
  doc: { warehouse: string; customerRut: string | null; docUnits: number },
  rule: ChannelRule,
): Channel {
  if (rule.projectOffices.includes(doc.warehouse)) return 'project';
  if (isCompanyRut(doc.customerRut, rule) && doc.docUnits >= rule.projectMinUnits) return 'project';
  return 'retail';
}
