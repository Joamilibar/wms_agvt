import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BsaleService } from './bsale.service.js';
import { StockLot } from '../stock/schemas/stock-lot.schema.js';
import { CacheService } from '../common/cache/cache.service.js';

/**
 * BSale caps `limit` at 50 silently: the page holds 50 items whatever was
 * asked for, while `count` reports the full total. This fake reproduces that,
 * because the previous sync advanced its offset by the requested 250 and so
 * read one row in five — and archived the other four as "not in BSale".
 */
const BSALE_CAP = 50;

function fakeBsale(collections: Record<string, any[]>) {
  const calls: string[] = [];
  return {
    calls,
    get: async (url: string): Promise<{ data: any }> => {
      calls.push(url);
      const [path, qs] = url.split('?');
      const params = new URLSearchParams(qs);
      const offset = Number(params.get('offset') || 0);
      const limit = Math.min(Number(params.get('limit') || BSALE_CAP), BSALE_CAP);
      const all = collections[path];
      if (!all) throw new Error('404 ' + path);
      return { data: { count: all.length, items: all.slice(offset, offset + limit) } };
    },
  };
}

async function build(collections: Record<string, any[]>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      BsaleService,
      { provide: ConfigService, useValue: { get: (k: string) => (k === 'bsale.token' ? 'x' : 'http://bsale') } },
      { provide: getModelToken(StockLot.name), useValue: {} },
      { provide: CacheService, useValue: { invalidate: async () => 0 } },
    ],
  }).compile();
  const service = moduleRef.get(BsaleService);
  const fake = fakeBsale(collections);
  (service as any).client = fake;
  return { service, fake };
}

describe('BsaleService pagination', () => {
  it('reads every pack even when BSale caps the page at 50', async () => {
    // 130 products, packs scattered across three pages of 50.
    const products = Array.from({ length: 130 }, (_, i) => ({
      id: 1000 + i,
      name: `Producto ${i}`,
      classification: i % 10 === 0 ? 3 : 1,
      pack_details: i % 10 === 0 ? [{ quantity: 2, variant: { id: 9000 + i } }] : [],
    }));
    const collections: Record<string, any[]> = { '/products.json': products };
    for (const p of products) {
      collections[`/products/${p.id}/variants.json`] = [{ id: 5000 + p.id, code: `PACK-${p.id}` }];
    }
    const { service, fake } = await build(collections);
    // Component lookups are single-resource GETs, not collections.
    const baseGet = fake.get;
    fake.get = async (url: string): Promise<{ data: any }> => {
      const m = url.match(/^\/variants\/(\d+)\.json/);
      if (m) return { data: { id: Number(m[1]), code: `SKU-${m[1]}`, description: '', product: { name: `Comp ${m[1]}` } } };
      return baseGet(url);
    };

    const packs = await service.getPackCatalog();

    expect(packs).toHaveLength(13);
    expect(packs.map((p) => p.packSku)).toContain('PACK-1120'); // from the third page
    expect(packs[0].components[0]).toMatchObject({ sku: 'SKU-9000', qtyPerPack: 2 });

    const productPages = fake.calls.filter((u) => u.startsWith('/products.json'));
    expect(productPages).toHaveLength(4); // 50 + 50 + 30 + the empty page that ends the loop
    expect(productPages[1]).toContain('offset=50');
  });
});
