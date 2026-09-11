import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios, { AxiosInstance } from 'axios';
import { StockLot, StockLotDocument } from '../stock/schemas/stock-lot.schema.js';

@Injectable()
export class BsaleService {
  private readonly logger = new Logger(BsaleService.name);
  private client: AxiosInstance | null = null;

  constructor(
    private configService: ConfigService,
    @InjectModel(StockLot.name) private stockLotModel: Model<StockLotDocument>,
  ) {
    const token = this.configService.get<string>('bsale.token');
    const baseUrl = this.configService.get<string>('bsale.baseUrl');

    if (token) {
      this.client = axios.create({
        baseURL: baseUrl,
        headers: { access_token: token },
        timeout: 10000,
      });
      this.logger.log('BSale client initialized');
    } else {
      this.logger.warn('BSale token not configured — integration disabled');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async testConnection(): Promise<{ connected: boolean; message: string }> {
    if (!this.client) {
      return { connected: false, message: 'BSale token not configured' };
    }
    try {
      await this.client.get('/users.json');
      return { connected: true, message: 'Connection successful' };
    } catch (error: any) {
      return { connected: false, message: error.message || 'Connection failed' };
    }
  }

  async getStatus() {
    return {
      configured: this.isConfigured(),
      baseUrl: this.configService.get<string>('bsale.baseUrl'),
      lastSync: null,
    };
  }

  async getDocuments(params: { limit?: number; officeid?: string; number?: string } = {}) {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');
    const q = new URLSearchParams();
    q.append('limit', String(params.limit || 25));
    if (params.officeid) q.append('officeid', params.officeid);
    if (params.number) q.append('number', params.number);
    
    // Add state=0 to fetch only active documents and expand=[client] to get the client names
    const { data } = await this.client.get(`/documents.json?${q.toString()}&state=0&expand=[client]`);
    
    return data;
  }

  async getOffices() {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');
    const { data } = await this.client.get(`/offices.json`);
    return data;
  }

  async getClients(query?: string) {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');
    const q = new URLSearchParams();
    if (query) q.append('company', query);
    // Expand to get contacts and addresses if needed, but standard limit is enough
    const { data } = await this.client.get(`/clients.json?${q.toString()}`);
    return data;
  }

  async getDocumentDetails(documentId: number) {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');
    
    // 1. Fetch original document details
    const { data: detailsData } = await this.client.get(`/documents/${documentId}/details.json`);
    
    // 2. Cross-reference with Shippings (Despachos)
    try {
      const { data: shippingsData } = await this.client.get(`/shippings.json?documentid=${documentId}`);
      
      const dispatchedQtyByVariant: Record<string, number> = {};

      if (shippingsData && shippingsData.items && shippingsData.items.length > 0) {
        // Fetch details of all shippings sequentially (or parallel)
        for (const shipping of shippingsData.items) {
          const res = await this.client.get(`/shippings/${shipping.id}/details.json`);
          const shippingDetails: any = res.data;
          if (shippingDetails && shippingDetails.items) {
            for (const sItem of (shippingDetails.items as any[])) {
              const varId = sItem.variant?.id?.toString() || sItem.variant?.href?.split('/').pop()?.split('.')[0];
              if (varId) {
                dispatchedQtyByVariant[varId] = (dispatchedQtyByVariant[varId] || 0) + sItem.quantity;
              }
            }
          }
        }
      }

      // 3. Subtract dispatched qty from original (sequentially to handle same SKU multiple times)
      if (detailsData.items) {
        detailsData.items = detailsData.items.map((item: any) => {
          const varId = item.variant?.id?.toString() || item.variant?.href?.split('/').pop()?.split('.')[0];
          let pendingQuantity = item.quantity;
          
          if (varId && dispatchedQtyByVariant[varId] > 0) {
            const toSubtract = Math.min(pendingQuantity, dispatchedQtyByVariant[varId]);
            pendingQuantity -= toSubtract;
            dispatchedQtyByVariant[varId] -= toSubtract;
          }
          
          return {
            ...item,
            pendingQuantity
          };
        });
        
        // 4. Enrich variant names with Product Name from BSale
        try {
          const uniqueVariantIds = [...new Set(detailsData.items.map((i: any) => i.variant?.id?.toString() || i.variant?.href?.split('/').pop()?.split('.')[0]).filter(Boolean))];
          const variantProducts: Record<string, string> = {};

          if (uniqueVariantIds.length > 0) {
            // Same bound as getStocksForVariants: a document with many lines used
            // to open one connection per line and could trip BSale's rate limit.
            const expandOne = async (vId: unknown) => {
              try {
                const res = await this.client!.get(`/variants/${vId}.json?expand=[product]`);
                if (res.data?.product?.name) {
                  variantProducts[vId as string] = res.data.product.name;
                }
              } catch (err) {
                // Ignore individually if a single expansion fails
              }
            };

            for (let i = 0; i < uniqueVariantIds.length; i += BsaleService.BSALE_CONCURRENCY) {
              const wave = uniqueVariantIds.slice(i, i + BsaleService.BSALE_CONCURRENCY);
              await Promise.all(wave.map(expandOne));
            }

            detailsData.items = detailsData.items.map((item: any) => {
              const varId = item.variant?.id?.toString() || item.variant?.href?.split('/').pop()?.split('.')[0];
              if (varId && variantProducts[varId]) {
                const prodName = variantProducts[varId];
                const varDesc = item.variant.description || '';
                // Modify description to include the parent product name
                item.variant.description = varDesc && varDesc !== prodName 
                  ? `${prodName} - ${varDesc}` 
                  : prodName;
              }
              return item;
            });
          }
        } catch (e) {
          console.warn(`Could not expand product names:`, e);
        }
      }
    } catch (e) {
      console.warn(`Could not cross-reference shippings for Document ${documentId}`);
      // Fallback: assume all is pending
      if (detailsData.items) {
        detailsData.items = detailsData.items.map((item: any) => ({ ...item, pendingQuantity: item.quantity }));
      }
    }

    return detailsData;
  }

  /**
   * M-07: this used to be an unbounded `Promise.all` over whatever list of ids
   * the client sent, which could open hundreds of simultaneous connections and
   * trip BSale's rate limit. Requests now go out in fixed-size waves.
   */
  private static readonly BSALE_CONCURRENCY = 5;

  async getStocksForVariants(officeid: string | number, variantids: string[]) {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');
    const result: Record<string, number> = {};

    const fetchOne = async (vid: string) => {
      try {
        const { data } = await this.client!.get(`/stocks.json?officeid=${officeid}&variantid=${vid}`);
        result[vid] = data?.items?.[0]?.quantityAvailable ?? 0;
      } catch (e) {
        result[vid] = 0;
      }
    };

    for (let i = 0; i < variantids.length; i += BsaleService.BSALE_CONCURRENCY) {
      const wave = variantids.slice(i, i + BsaleService.BSALE_CONCURRENCY);
      await Promise.all(wave.map(fetchOne));
    }

    return result;
  }

  /**
   * Compares one SKU's WMS balance against BSale, per warehouse.
   *
   * Fills the gap the audit flagged: without a reconciliation endpoint the only
   * corrective action available was the full wipe-and-rebuild of B-05. This one
   * only reports — it never writes — so it is safe to run at any time.
   */
  async reconcileSku(sku: string, apply = false): Promise<{
    sku: string;
    checkedAt: string;
    applied: boolean;
    lines: {
      warehouse: string;
      bsaleVariantId: string | null;
      wmsQty: number;
      bsaleQty: number | null;
      difference: number | null;
      action?: string;
      note?: string;
    }[];
  }> {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');

    const lots = await this.stockLotModel.find({ sku, isActive: true }).exec();

    // WMS side: physical balance per warehouse, plus the variant mapping and the
    // descriptors a top-up lot would need.
    const byWarehouse = new Map<string, {
      wmsQty: number;
      variantId: string | null;
      name: string;
      cost: number;
    }>();
    for (const lot of lots) {
      const entry = byWarehouse.get(lot.warehouse)
        || { wmsQty: 0, variantId: null, name: lot.name, cost: lot.unitCost };
      entry.wmsQty += lot.qty;
      entry.variantId = entry.variantId || lot.bsaleProductId;
      byWarehouse.set(lot.warehouse, entry);
    }

    // BSale side: office name -> id, to translate the warehouse names back.
    const { data: officesData } = await this.client.get('/offices.json');
    const officeIdByName: Record<string, string> = {};
    for (const office of officesData?.items || []) {
      officeIdByName[office.name] = office.id.toString();
    }

    const lines = [];
    for (const [warehouse, entry] of byWarehouse) {
      const officeId = officeIdByName[warehouse];

      if (!entry.variantId || !officeId) {
        lines.push({
          warehouse,
          bsaleVariantId: entry.variantId,
          wmsQty: entry.wmsQty,
          bsaleQty: null,
          difference: null,
          note: !entry.variantId
            ? 'Lotes sin bsaleProductId: no hay mapeo con el catalogo BSale'
            : 'La bodega no corresponde a ninguna sucursal BSale',
        });
        continue;
      }

      const stocks = await this.getStocksForVariants(officeId, [entry.variantId]);
      const bsaleQty = stocks[entry.variantId] ?? 0;

      const line: {
        warehouse: string;
        bsaleVariantId: string | null;
        wmsQty: number;
        bsaleQty: number | null;
        difference: number | null;
        action?: string;
        note?: string;
      } = {
        warehouse,
        bsaleVariantId: entry.variantId,
        wmsQty: entry.wmsQty,
        bsaleQty,
        difference: entry.wmsQty - bsaleQty,
      };

      // BSale is the source of truth for quantity, so correcting means moving the
      // WMS to it — through the same routine the full sync uses, never a second
      // implementation of the same decision.
      if (apply) {
        const now = new Date();
        const result = await this.alignSkuWarehouse({
          sku,
          warehouse,
          variantId: entry.variantId,
          officeId,
          name: entry.name,
          cost: entry.cost,
          targetQty: bsaleQty,
          now,
          stamp: now.toISOString().slice(0, 10).replace(/-/g, ''),
        });
        line.action = result.action;
        if (result.warnings.length > 0) line.note = result.warnings.join(' · ');
      }

      lines.push(line);
    }

    return { sku, checkedAt: new Date().toISOString(), applied: apply, lines };
  }

  async generateGuide(payload: any) {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');
    const { data } = await this.client.post('/documents.json', payload);
    return data;
  }

  // ── BSale → MongoDB Stock Sync (Day Zero Approach) ──────────────────────
  // `clearExisting` defaults to false on purpose: this used to delete the whole
  // StockLot collection whenever the flag was merely absent from the body.
  async syncStockFromBsale(clearExisting = false, requestedBy?: string): Promise<{
    consumed: number;
    created: number;
    skipped: number;
    archived: number;
    unchanged: number;
    increased: number;
    decreased: number;
    skusChecked: number;
    errors: string[];
  }> {
    if (!this.client) throw new ServiceUnavailableException('BSale no configurado');

    const errors: string[] = [];
    let created = 0;
    let skipped = 0;
    let archived = 0;
    let unchanged = 0;
    let increased = 0;
    let decreased = 0;

    this.logger.warn(
      `BSale stock sync requested by user ${requestedBy ?? 'unknown'} ` +
      `(clearExisting=${clearExisting})`,
    );

    // 1. `clearExisting` is now an escape hatch, not the normal path: it throws
    // away every entry date and therefore the aging report. Leave it false and
    // step 5 reconciles quantities while preserving lot history.
    //
    // Archive, never delete: orders and guides hold ObjectId references to these
    // documents, and a WMS exists to keep that trail. Archived lots drop out of
    // every FIFO/analytics query via isActive, and out of the partial unique index.
    if (clearExisting) {
      const res = await this.stockLotModel
        .updateMany(
          { isActive: true },
          { $set: { isActive: false, archivedAt: new Date() } },
        )
        .exec();
      archived = res.modifiedCount;
      this.logger.log(`Archived ${archived} StockLots (Day Zero Reset, reversible)`);
    }

    // 2. Resolve office → warehouse name mapping
    const { data: officesData } = await this.client.get('/offices.json');
    const officeMap: Record<string, string> = {};
    for (const o of officesData.items || []) {
      officeMap[o.id.toString()] = o.name;
    }

    // 3. Pre-fetch all variants to resolve SKU and Names efficiently
    const variantMap: Record<string, { sku: string; name: string; cost: number }> = {};
    let vOffset = 0, vLimit = 250, vTotal = Infinity;
    this.logger.log('Fetching BSale variants catalog...');
    while (vOffset < vTotal) {
      try {
        const res: any = await this.client!.get(`/variants.json?limit=${vLimit}&offset=${vOffset}&expand=[product]`);
        const data: any = res.data;
        vTotal = data.count || 0;
        for (const v of data.items || []) {
          const varId = v.id.toString();
          const pName = v.product?.name || '';
          const vDesc = v.description || '';
          variantMap[varId] = {
            sku: v.code || v.barCode || varId,
            name: (pName && vDesc && pName !== vDesc) ? `${pName} - ${vDesc}` : pName || vDesc || `Variante ${varId}`,
            cost: v.standardCost || 0,
          };
        }
        vOffset += vLimit;
      } catch (e: any) {
        errors.push(`Failed to fetch variants batch at offset ${vOffset}: ${e.message}`);
        break; // If variants fail entirely, we might degrade gracefully but we need them
      }
    }

    // 4. Build BSale's picture of the world: units per (SKU, warehouse).
    const target = new Map<string, {
      sku: string;
      warehouse: string;
      officeId: string;
      variantId: string;
      name: string;
      cost: number;
      qty: number;
    }>();

    let sOffset = 0, sLimit = 250, sTotal = Infinity;
    this.logger.log('Fetching BSale stock levels...');

    while (sOffset < sTotal) {
      try {
        const res: any = await this.client!.get(`/stocks.json?limit=${sLimit}&offset=${sOffset}`);
        const data: any = res.data;
        sTotal = data.count || 0;

        for (const stock of data.items || []) {
          const qty = stock.quantityAvailable;
          const officeId = stock.office?.id?.toString();
          const variantId = (stock.variant?.href || '').split('/').pop()?.split('.')[0];

          if (!officeId || !variantId) {
            skipped++;
            continue;
          }

          const warehouse = officeMap[officeId] || `Sucursal ${officeId}`;
          const vData = variantMap[variantId] || { sku: variantId, name: `Variante ${variantId}`, cost: 0 };

          target.set(vData.sku + '|||' + warehouse, {
            sku: vData.sku,
            warehouse,
            officeId,
            variantId,
            name: vData.name,
            cost: vData.cost,
            qty: Math.max(0, qty || 0),
          });
        }

        sOffset += sLimit;
      } catch (e: any) {
        errors.push(`Failed to fetch stocks batch at offset ${sOffset}: ${e.message}`);
        break;
      }
    }

    // 5. Reconcile the WMS against it.
    //
    // BSale is the source of truth for *how many units exist*. It does not track
    // lots, so it cannot be the source of truth for something it does not record:
    // the WMS keeps owning lot codes, entry dates and physical locations.
    //
    // That split is the whole point of reconciling instead of rebuilding. The
    // previous behaviour archived every lot and recreated them all with
    // entryDate = now, which matched BSale's quantities and destroyed the aging
    // report in the same stroke — every SKU looked like it arrived today. Here a
    // lot whose quantity already agrees with BSale is left untouched, and keeps
    // the entry date that makes aging mean something.
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seen = new Set<string>();

    for (const [key, entry] of target) {
      seen.add(key);

      const result = await this.alignSkuWarehouse({
        sku: entry.sku,
        warehouse: entry.warehouse,
        variantId: entry.variantId,
        officeId: entry.officeId,
        name: entry.name,
        cost: entry.cost,
        targetQty: entry.qty,
        now,
        stamp,
      });

      if (result.action === 'unchanged') unchanged++;
      if (result.action === 'increased') increased++;
      if (result.action === 'decreased') decreased++;
      created += result.created;
      archived += result.archived;
      errors.push(...result.warnings);
    }

    // 6. Anything active in the WMS that BSale no longer reports does not exist.
    const orphaned = await this.stockLotModel.find({ isActive: true }).exec();
    for (const lot of orphaned) {
      if (seen.has(lot.sku + '|||' + lot.warehouse)) continue;
      if (lot.reservedQty > 0) {
        errors.push(`${lot.sku} en ${lot.warehouse}: BSale no lo reporta pero tiene unidades reservadas`);
        continue;
      }
      await this.stockLotModel
        .updateOne({ _id: lot._id }, { $set: { isActive: false, archivedAt: now } })
        .exec();
      archived++;
    }

    this.logger.log(
      `Sync complete. Sin cambios: ${unchanged}, con faltante cubierto: ${increased}, ` +
      `ajustados a la baja: ${decreased}, lotes creados: ${created}, archivados: ${archived}, ` +
      `omitidos: ${skipped}, avisos: ${errors.length}`,
    );

    return {
      consumed: vTotal,
      created,
      skipped,
      archived,
      unchanged,
      increased,
      decreased,
      skusChecked: target.size,
      errors,
    };
  }

  /**
   * Brings one (SKU, warehouse) pair to the quantity BSale reports.
   *
   * This is the one place that acts on the source-of-truth decision, so the full
   * sync and the per-SKU reconciliation cannot drift apart:
   *
   *  - BSale owns the quantity.
   *  - The WMS owns the lot structure — codes, entry dates, locations — because
   *    BSale does not record it and so cannot be authoritative over it.
   *  - Only an unexplained surplus gets a day-zero entry date. Lots that already
   *    agree keep theirs, which is what keeps the aging report meaningful.
   *  - Reserved units are never taken away: an operator mid-aisle beats a
   *    temporary discrepancy, and the leftover is reported instead.
   */
  private async alignSkuWarehouse(input: {
    sku: string;
    warehouse: string;
    variantId: string | null;
    officeId: string | null;
    name: string;
    cost: number;
    targetQty: number;
    now: Date;
    stamp: string;
  }): Promise<{
    action: 'unchanged' | 'increased' | 'decreased';
    wmsQty: number;
    created: number;
    archived: number;
    shortfall: number;
    warnings: string[];
  }> {
    const { sku, warehouse, targetQty, now, stamp } = input;
    const warnings: string[] = [];

    const lots = await this.stockLotModel
      .find({ sku, warehouse, isActive: true })
      .sort({ entryDate: 1 })
      .exec();

    const wmsQty = lots.reduce((sum, lot) => sum + lot.qty, 0);

    if (wmsQty === targetQty) {
      return { action: 'unchanged', wmsQty, created: 0, archived: 0, shortfall: 0, warnings };
    }

    if (wmsQty < targetQty) {
      const surplus = targetQty - wmsQty;
      const base = 'BSL-ADJ-' + (input.variantId ?? 'NA') + '-' + (input.officeId ?? 'NA') + '-' + stamp;
      let lotKey = base;
      let attempt = 1;

      while (await this.stockLotModel.exists({ lot: lotKey, warehouse, isActive: true })) {
        attempt++;
        lotKey = base + '-' + attempt;
      }

      try {
        await this.stockLotModel.create({
          sku,
          name: input.name,
          lot: lotKey,
          entryDate: now,
          qty: surplus,
          initialQty: surplus,
          unitCost: input.cost,
          warehouse,
          bsaleProductId: input.variantId,
          isActive: true,
          createdBy: null,
        });
        return { action: 'increased', wmsQty, created: 1, archived: 0, shortfall: 0, warnings };
      } catch (e: any) {
        warnings.push(`${sku} en ${warehouse}: no se pudieron agregar ${surplus} unidades: ${e.message}`);
        return { action: 'increased', wmsQty, created: 0, archived: 0, shortfall: surplus, warnings };
      }
    }

    let excess = wmsQty - targetQty;
    let archived = 0;

    for (const lot of lots) {
      if (excess <= 0) break;

      const reducible = Math.max(0, lot.qty - lot.reservedQty);
      if (reducible <= 0) continue;

      const take = Math.min(reducible, excess);
      const emptied = lot.qty - take <= 0;

      const res = await this.stockLotModel.updateOne(
        { _id: lot._id, qty: { $gte: take } },
        {
          $inc: { qty: -take },
          ...(emptied ? { $set: { isActive: false, archivedAt: now } } : {}),
        },
      ).exec();

      if (res.modifiedCount !== 1) continue;

      if (emptied) archived++;
      excess -= take;
    }

    if (excess > 0) {
      warnings.push(
        `${sku} en ${warehouse}: quedan ${excess} unidades sobre BSale que no se pudieron ` +
        `descontar porque estan reservadas por una orden en curso`,
      );
    }

    return { action: 'decreased', wmsQty, created: 0, archived, shortfall: excess, warnings };
  }

}

