import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class BsaleService {
  private readonly logger = new Logger(BsaleService.name);
  private client: AxiosInstance | null = null;

  constructor(private configService: ConfigService) {
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
}
