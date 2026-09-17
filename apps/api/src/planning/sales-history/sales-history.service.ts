import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { BsaleService } from '../../bsale/bsale.service.js';
import { PackRecipe, PackRecipeDocument } from '../../packs/schemas/pack-recipe.schema.js';
import { SalesHistory, SalesHistoryDocument, Channel } from '../schemas/sales-history.schema.js';
import { PlanningParamsService } from '../masters/planning-params.service.js';
import { classifyDocument, isCompanyRut, ChannelRule } from './channel.js';
import { HISTORY_FLOOR, monthKey } from '../history-window.js';

export interface LoadResult {
  from: string;
  to: string;
  documents: number;
  skippedDocuments: number;
  lines: number;
  packLinesExploded: number;
  creditNotesLinked: number;
  creditNotesUnlinked: number;
  outlierDocs: number;
  outlierThreshold: number;
  byChannel: Record<Channel, { documents: number; units: number }>;
  warnings: string[];
}

interface DocTypeInfo { id: number; name: string; kind: 'sale' | 'credit' | 'debit' | 'other' }

interface RawLine {
  bsaleDocId: number; docKey: string; docTypeId: number; docType: string; isCreditNote: boolean;
  lineId: number; fromPackSku: string | null; date: Date; month: string; officeId: string; warehouse: string;
  sku: string; variantId: string | null; productName: string; qty: number; net: number;
  customerRut: string | null; customerIsCompany: boolean; customerName: string; docUnits: number;
  channel: Channel; refDocId: number | null; isOutlier: boolean; isService: boolean;
}

/**
 * Loads the sales history from BSale into `sales_history`, already shaped
 * for the demand engine: channel per document (D1), credit notes tied to the
 * invoice they cancel through /returns, packs exploded to components with
 * the recipes the WMS keeps, services set aside, retail outliers flagged.
 *
 * Idempotent: lines are upserted by (document, line, pack, sku), so the
 * monthly re-run over the last months only touches what changed.
 */
@Injectable()
export class SalesHistoryService {
  private readonly logger = new Logger(SalesHistoryService.name);

  constructor(
    @InjectModel(SalesHistory.name) private model: Model<SalesHistoryDocument>,
    @InjectModel(PackRecipe.name) private recipeModel: Model<PackRecipeDocument>,
    private bsale: BsaleService,
    private params: PlanningParamsService,
  ) {}

  // ── load ───────────────────────────────────────────────────────────────────

  async loadFromBsale(from: Date, to: Date, requestedBy = 'system'): Promise<LoadResult> {
    const params = await this.params.current();
    const rule: ChannelRule = {
      projectOffices: params.projectOffices,
      projectMinUnits: params.projectMinUnits,
      companyRutMin: params.companyRutMin,
      companyRutMax: params.companyRutMax,
    };
    const warnings: string[] = [];
    this.logger.log(`Sales history load ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} by ${requestedBy}`);

    // 1. Reference data: document types, offices, product classification, pack recipes, returns.
    const docTypes = await this.docTypes();
    const offices = new Map<string, string>();
    for (const o of await this.bsale.fetchAll('/offices.json')) offices.set(String(o.id), o.name);

    const classification = new Map<string, number>();
    for (const p of await this.bsale.fetchAll('/products.json')) classification.set(String(p.id), p.classification);

    const recipes = new Map<string, { sku: string; name: string; qtyPerPack: number }[]>();
    for (const r of await this.recipeModel.find({ isActive: true }).exec()) recipes.set(r.packSku, r.components);

    const returns = new Map<number, number>(); // credit note doc id → referenced doc id
    for (const r of await this.bsale.fetchAll('/returns.json', '&expand=[reference_document,credit_note]')) {
      const cn = Number(r.credit_note?.id);
      const ref = Number(r.reference_document?.id);
      if (cn && ref) returns.set(cn, ref);
    }

    // 2. Documents in range, with details inline (paged past 25 when needed).
    const fromTs = Math.floor(from.getTime() / 1000);
    const toTs = Math.floor(to.getTime() / 1000) + 86399;
    const docs = await this.bsale.fetchAll(
      '/documents.json',
      `&emissiondaterange=[${fromTs},${toTs}]&expand=[document_type,office,client,details]`,
    );
    this.logger.log(`  ${docs.length} documents fetched`);

    const dateById = new Map<number, Date>();
    for (const d of docs) dateById.set(Number(d.id), new Date(d.emissionDate * 1000));

    const lines: RawLine[] = [];
    let skipped = 0;
    let packLinesExploded = 0;
    let creditNotesLinked = 0;
    let creditNotesUnlinked = 0;

    for (const d of docs) {
      const type = docTypes.get(Number(d.document_type?.id));
      if (!type || type.kind === 'other' || d.state !== 0) { skipped++; continue; }

      const details = await this.allDetails(d);
      const date = new Date(d.emissionDate * 1000);
      const warehouse = offices.get(String(d.office?.id)) ?? d.office?.name ?? `Sucursal ${d.office?.id}`;
      const customerRut: string | null = d.client?.code ?? null;
      const customerName: string = d.client?.company || [d.client?.firstName, d.client?.lastName].filter(Boolean).join(' ').trim() || '';
      const sign = type.kind === 'credit' ? -1 : 1;

      const productLines = details.filter((l) => l.variant?.code && l.product?.id && classification.get(String(l.product.id)) !== 2);
      const docUnits = productLines.reduce((s, l) => s + Math.abs(Number(l.quantity) || 0), 0);
      const channel = classifyDocument({ warehouse, customerRut, docUnits }, rule);

      let refDocId: number | null = null;
      let month = monthKey(date);
      if (type.kind === 'credit') {
        refDocId = returns.get(Number(d.id)) ?? null;
        if (refDocId) {
          creditNotesLinked++;
          const refDate = dateById.get(refDocId) ?? (await this.dateOf(refDocId));
          if (refDate && refDate >= HISTORY_FLOOR) month = monthKey(refDate);
        } else {
          creditNotesUnlinked++;
        }
      }

      const base = {
        bsaleDocId: Number(d.id), docKey: `${type.id}#${d.number}`, docTypeId: type.id, docType: type.name,
        isCreditNote: type.kind === 'credit', date, month, officeId: String(d.office?.id ?? ''), warehouse,
        customerRut, customerIsCompany: isCompanyRut(customerRut, rule), customerName, docUnits, channel,
        refDocId, isOutlier: false,
      };

      for (const l of details) {
        const sku: string | null = l.variant?.code ?? null;
        if (!sku) { skipped++; continue; }
        const productId = String(l.product?.id ?? '');
        const cls = classification.get(productId);
        const qty = sign * (Number(l.quantity) || 0);
        const net = sign * (Number(l.netAmount) || 0);
        const common = {
          ...base, lineId: Number(l.id), variantId: String(l.variant?.id ?? ''), productName: l.product?.name ?? l.variant?.description ?? '',
        };

        // A free-text line ("glosa") has no product behind it: BSale mints a
        // numeric variant code for it. Services and glosas are audit, not demand.
        if (cls === 2 || !l.product?.id || !common.productName || this.looksLikeService(common.productName)) {
          lines.push({ ...common, fromPackSku: null, sku, qty, net, isService: true });
          continue;
        }

        const components = cls === 3 ? recipes.get(sku) : undefined;
        if (cls === 3 && components && components.length > 0) {
          // The pack itself is kept as a service-like audit line (not demand), and
          // each component gets its share: qty × qtyPerPack, net split by units.
          lines.push({ ...common, fromPackSku: null, sku, qty, net, isService: true });
          const totalUnits = components.reduce((s, c) => s + c.qtyPerPack, 0);
          for (const c of components) {
            lines.push({
              ...common, fromPackSku: sku, sku: c.sku, productName: c.name,
              qty: qty * c.qtyPerPack, net: totalUnits ? (net * c.qtyPerPack) / totalUnits : 0, isService: false,
            });
            packLinesExploded++;
          }
          continue;
        }
        if (cls === 3) warnings.push(`Pack ${sku} sin receta: se cuenta como SKU propio`);
        lines.push({ ...common, fromPackSku: null, sku, qty, net, isService: false });
      }
    }

    // 3. Retail outliers: documents at or above the P99 of units.
    const retailDocUnits = [...new Map(lines.filter((l) => l.channel === 'retail' && !l.isCreditNote).map((l) => [l.bsaleDocId, l.docUnits])).values()];
    const threshold = percentile(retailDocUnits, params.outlierPercentile);
    let outlierDocs = 0;
    const outlierIds = new Set<number>();
    for (const l of lines) {
      if (l.channel === 'retail' && !l.isCreditNote && l.docUnits >= threshold && threshold > 0) {
        l.isOutlier = true;
        outlierIds.add(l.bsaleDocId);
      }
    }
    outlierDocs = outlierIds.size;

    // 4. Manual channel overrides survive a reload.
    const overrides = await this.model.aggregate<{ _id: number; channelOverride: Channel; channelReason: string }>([
      { $match: { channelOverride: { $ne: null }, bsaleDocId: { $in: [...dateById.keys()] } } },
      { $group: { _id: '$bsaleDocId', channelOverride: { $first: '$channelOverride' }, channelReason: { $first: '$channelReason' } } },
    ]).exec();
    const overrideMap = new Map(overrides.map((o) => [o._id, o]));

    // 5. Upsert.
    const ops: AnyBulkWriteOperation<SalesHistory>[] = lines.map((l) => {
      const o = overrideMap.get(l.bsaleDocId);
      const doc = o ? { ...l, channel: o.channelOverride, channelOverride: o.channelOverride, channelReason: o.channelReason } : { ...l, channelOverride: null, channelReason: '' };
      return {
        updateOne: {
          filter: { bsaleDocId: l.bsaleDocId, lineId: l.lineId, fromPackSku: l.fromPackSku, sku: l.sku },
          update: { $set: doc },
          upsert: true,
        },
      };
    });
    for (let i = 0; i < ops.length; i += 1000) {
      await this.model.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    }

    const byChannel: LoadResult['byChannel'] = { retail: { documents: 0, units: 0 }, project: { documents: 0, units: 0 } };
    const seenDocs = new Set<string>();
    for (const l of lines) {
      if (l.isService) continue;
      const key = `${l.channel}|${l.bsaleDocId}`;
      if (!seenDocs.has(key)) { seenDocs.add(key); byChannel[l.channel].documents++; }
      byChannel[l.channel].units += l.qty;
    }

    const result: LoadResult = {
      from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
      documents: docs.length - skipped, skippedDocuments: skipped, lines: lines.length, packLinesExploded,
      creditNotesLinked, creditNotesUnlinked, outlierDocs, outlierThreshold: threshold, byChannel,
      warnings: [...new Set(warnings)].slice(0, 50),
    };
    this.logger.log(`Sales history load done: ${result.documents} docs, ${result.lines} lines, retail ${byChannel.retail.units} u / project ${byChannel.project.units} u`);
    return result;
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  /** Units and net per month, split by channel. The overview of the history. */
  monthlyTotals(fromMonth: string, toMonth: string) {
    return this.model.aggregate([
      { $match: { isService: false, month: { $gte: fromMonth, $lte: toMonth } } },
      { $group: { _id: { month: '$month', channel: '$channel' }, units: { $sum: '$qty' }, net: { $sum: '$net' }, lines: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ]).exec();
  }

  /** Monthly series of one SKU (components of packs included), by channel and optionally by warehouse. */
  skuSeries(sku: string, fromMonth: string, toMonth: string, byWarehouse = false) {
    const id: Record<string, string> = { month: '$month', channel: '$channel' };
    if (byWarehouse) id.warehouse = '$warehouse';
    return this.model.aggregate([
      { $match: { sku, isService: false, month: { $gte: fromMonth, $lte: toMonth } } },
      { $group: { _id: id, units: { $sum: '$qty' }, net: { $sum: '$net' }, viaPack: { $sum: { $cond: [{ $ne: ['$fromPackSku', null] }, '$qty', 0] } } } },
      { $sort: { '_id.month': 1 } },
    ]).exec();
  }

  /** Documents of the window with their channel, for review and override. */
  async documents(query: { channel?: Channel; month?: string; search?: string; limit?: number; page?: number }) {
    const match: Record<string, unknown> = { isService: false };
    if (query.channel) match.channel = query.channel;
    if (query.month) match.month = query.month;
    if (query.search) match.$or = [{ customerName: { $regex: query.search, $options: 'i' } }, { docKey: query.search }];
    const limit = Math.min(query.limit ?? 50, 200);
    const page = Math.max(query.page ?? 1, 1);
    const [rows, total] = await Promise.all([
      this.model.aggregate([
        { $match: match },
        { $group: {
          _id: '$bsaleDocId', docKey: { $first: '$docKey' }, docType: { $first: '$docType' }, date: { $first: '$date' }, month: { $first: '$month' },
          warehouse: { $first: '$warehouse' }, customerName: { $first: '$customerName' }, customerRut: { $first: '$customerRut' },
          channel: { $first: '$channel' }, channelOverride: { $first: '$channelOverride' }, channelReason: { $first: '$channelReason' },
          units: { $sum: '$qty' }, net: { $sum: '$net' }, isOutlier: { $first: '$isOutlier' }, refDocId: { $first: '$refDocId' },
        } },
        { $sort: { date: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]).exec(),
      this.model.distinct('bsaleDocId', match).exec().then((d) => d.length),
    ]);
    return { data: rows, total, page, limit };
  }

  async setChannelOverride(bsaleDocId: number, channel: Channel | null, reason: string) {
    const existing = await this.model.findOne({ bsaleDocId }).exec();
    if (!existing) throw new NotFoundException('Documento no encontrado en el historial');
    if (channel) {
      await this.model.updateMany({ bsaleDocId }, { $set: { channel, channelOverride: channel, channelReason: reason } }).exec();
    } else {
      // Back to the rule: recompute from the stored facts of the document.
      const params = await this.params.current();
      const computed = classifyDocument(
        { warehouse: existing.warehouse, customerRut: existing.customerRut, docUnits: existing.docUnits },
        { projectOffices: params.projectOffices, projectMinUnits: params.projectMinUnits, companyRutMin: params.companyRutMin, companyRutMax: params.companyRutMax },
      );
      await this.model.updateMany({ bsaleDocId }, { $set: { channel: computed, channelOverride: null, channelReason: '' } }).exec();
    }
    return this.model.findOne({ bsaleDocId }).exec();
  }

  async coverage(): Promise<{ firstMonth: string | null; lastMonth: string | null; lines: number; documents: number }> {
    const [agg] = await this.model.aggregate<{ firstMonth: string; lastMonth: string; lines: number }>([
      { $group: { _id: null, firstMonth: { $min: '$month' }, lastMonth: { $max: '$month' }, lines: { $sum: 1 } } },
    ]).exec();
    const documents = (await this.model.distinct('bsaleDocId').exec()).length;
    return { firstMonth: agg?.firstMonth ?? null, lastMonth: agg?.lastMonth ?? null, lines: agg?.lines ?? 0, documents };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async docTypes(): Promise<Map<number, DocTypeInfo>> {
    const map = new Map<number, DocTypeInfo>();
    for (const t of await this.bsale.fetchAll('/document_types.json')) {
      // use: 0 sale · 1 credit note · 2 dispatch guide · 4 debit note · 5 purchase.
      // Quotes and sales notes are not sales (isSalesNote). Anything else is ignored.
      let kind: DocTypeInfo['kind'] = 'other';
      if (!t.isSalesNote && t.codeSii) {
        if (t.use === 0) kind = 'sale';
        else if (t.use === 1 || t.isCreditNote) kind = 'credit';
        else if (t.use === 4) kind = 'debit';
      }
      map.set(Number(t.id), { id: Number(t.id), name: String(t.name).trim(), kind });
    }
    return map;
  }

  /** The inline `details` carries at most 25 lines; page the rest. */
  private async allDetails(doc: any): Promise<any[]> {
    const inline = doc.details?.items ?? [];
    const count = Number(doc.details?.count ?? inline.length);
    if (inline.length >= count) return inline;
    return this.bsale.fetchAll(`/documents/${doc.id}/details.json`);
  }

  private async dateOf(docId: number): Promise<Date | null> {
    try {
      const d = await this.bsale.getRaw<{ emissionDate: number }>(`/documents/${docId}.json`);
      return d?.emissionDate ? new Date(d.emissionDate * 1000) : null;
    } catch {
      return null;
    }
  }

  private looksLikeService(name: string): boolean {
    return /^(glosa|despacho|flete|servicio)\b/i.test(name.trim());
  }
}

/** Nearest-rank percentile of a list of numbers; 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}
