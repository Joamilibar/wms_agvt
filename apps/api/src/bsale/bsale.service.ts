import { Injectable, Logger } from '@nestjs/common';
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
    if (!this.client) throw new Error('BSale no configurado');
    const q = new URLSearchParams();
    q.append('limit', String(params.limit || 25));
    if (params.officeid) q.append('officeid', params.officeid);
    if (params.number) q.append('number', params.number);
    
    // Add state=0 to fetch only active documents and expand=[client] to get the client names
    const { data } = await this.client.get(`/documents.json?${q.toString()}&state=0&expand=[client]`);
    
    return data;
  }

  async getOffices() {
    if (!this.client) throw new Error('BSale no configurado');
    const { data } = await this.client.get(`/offices.json`);
    return data;
  }

  async getClients(query?: string) {
    if (!this.client) throw new Error('BSale no configurado');
    const q = new URLSearchParams();
    if (query) q.append('company', query);
    // Expand to get contacts and addresses if needed, but standard limit is enough
    const { data } = await this.client.get(`/clients.json?${q.toString()}`);
    return data;
  }

  async getDocumentDetails(documentId: number) {
    if (!this.client) throw new Error('BSale no configurado');
    
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
            await Promise.all(
              uniqueVariantIds.map(async (vId) => {
                try {
                  const res = await this.client!.get(`/variants/${vId}.json?expand=[product]`);
                  if (res.data?.product?.name) {
                    variantProducts[vId as string] = res.data.product.name;
                  }
                } catch (err) {
                  // Ignore individually if a single expansion fails
                }
              })
            );

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

  async getStocksForVariants(officeid: string | number, variantids: string[]) {
    if (!this.client) throw new Error('BSale no configurado');
    const result: Record<string, number> = {};
    
    await Promise.all(variantids.map(async (vid) => {
      try {
        const { data } = await this.client!.get(`/stocks.json?officeid=${officeid}&variantid=${vid}`);
        if (data && data.items && data.items[0]) {
          // You said "cantidad disponible para la venta" which is quantityAvailable
          result[vid] = data.items[0].quantityAvailable;
        } else {
          result[vid] = 0;
        }
      } catch (e) {
        result[vid] = 0;
      }
    }));
    return result;
  }

  async generateGuide(payload: any) {
    if (!this.client) throw new Error('BSale no configurado');
    const { data } = await this.client.post('/documents.json', payload);
    return data;
  }

  // ── BSale → MongoDB Stock Sync (Day Zero Approach) ──────────────────────
  async syncStockFromBsale(clearExisting = true): Promise<{
    consumed: number;
    created: number;
    skipped: number;
    errors: string[];
  }> {
    if (!this.client) throw new Error('BSale no configurado');

    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    // 1. Optionally wipe existing data
    if (clearExisting) {
      const deleted = await this.stockLotModel.deleteMany({}).exec();
      this.logger.log(`Cleared ${deleted.deletedCount} existing StockLots (Day Zero Reset)`);
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
        const { data } = await this.client.get(`/variants.json?limit=${vLimit}&offset=${vOffset}&expand=[product]`);
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

    // 4. Fetch all current stocks
    let sOffset = 0, sLimit = 250, sTotal = Infinity;
    const now = new Date(); // DAY ZERO TIMESTAMP
    this.logger.log('Fetching and creating current stock lots...');

    while (sOffset < sTotal) {
      try {
        const { data } = await this.client.get(`/stocks.json?limit=${sLimit}&offset=${sOffset}`);
        sTotal = data.count || 0;

        for (const stock of data.items || []) {
          const qty = stock.quantityAvailable;
          if (!qty || qty <= 0) {
            skipped++;
            continue;
          }

          const officeId = stock.office?.id?.toString();
          const variantHref = stock.variant?.href || '';
          const variantId = variantHref.split('/').pop()?.split('.')[0];

          if (!officeId || !variantId) {
            skipped++;
            continue;
          }

          const warehouse = officeMap[officeId] || `Sucursal ${officeId}`;
          const vData = variantMap[variantId] || { sku: variantId, name: `Variante ${variantId}`, cost: 0 };
          const lotKey = `BSL-INI-${variantId}-${officeId}`;

          try {
            await this.stockLotModel.create({
              sku: vData.sku,
              name: vData.name,
              lot: lotKey,
              entryDate: now, // Day Zero
              qty: qty,
              initialQty: qty,
              unitCost: vData.cost, // Uses standardCost if available
              warehouse,
              location: '',
              rack: '',
              col: '',
              row: '',
              pallet: '',
              supplier: null,
              bsaleProductId: variantId,
              isActive: true,
              createdBy: null,
            });
            created++;
          } catch (e: any) {
            if (e.code === 11000) {
              errors.push(`Duplicate lot for ${vData.sku} in ${warehouse}`);
            } else {
              errors.push(`Create failed for lot ${lotKey}: ${e.message}`);
            }
            skipped++;
          }
        }
        sOffset += sLimit;
      } catch (e: any) {
        errors.push(`Failed to fetch stocks batch at offset ${sOffset}: ${e.message}`);
        break;
      }
    }

    this.logger.log(`Sync complete. Created: ${created}, Skipped (Zero-stock or dup): ${skipped}, Errors: ${errors.length}`);
    return { consumed: vTotal /* variants analyzed conceptually */, created, skipped, errors };
  }
}

