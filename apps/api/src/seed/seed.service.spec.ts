import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { SeedService } from './seed.service.js';
import { User } from '../users/schemas/user.schema.js';
import { StockLot } from '../stock/schemas/stock-lot.schema.js';
import { Order } from '../orders/schemas/order.schema.js';
import { Guide } from '../guides/schemas/guide.schema.js';
import { SalesRecord } from '../analytics/schemas/sales-record.schema.js';

/**
 * A-09: the seed used to run everywhere, with one shared hash for all three
 * accounts and a default admin password. These tests pin the split between
 * the admin bootstrap (always) and the demo data (never in production).
 */
type Doc = Record<string, unknown>;

class FakeModel {
  docs: Doc[] = [];
  private seq = 0;
  countDocuments() {
    return { exec: () => Promise.resolve(this.docs.length) };
  }
  create(doc: Doc): Promise<Doc> {
    const created = { _id: `id-${++this.seq}`, ...doc };
    this.docs.push(created);
    return Promise.resolve(created);
  }
  insertMany(docs: Doc[]): Promise<Doc[]> {
    this.docs.push(...docs);
    return Promise.resolve(docs);
  }
}

async function build(config: Record<string, unknown>) {
  const users = new FakeModel();
  const lots = new FakeModel();
  const orders = new FakeModel();
  const guides = new FakeModel();
  const sales = new FakeModel();

  const moduleRef = await Test.createTestingModule({
    providers: [
      SeedService,
      { provide: getModelToken(User.name), useValue: users },
      { provide: getModelToken(StockLot.name), useValue: lots },
      { provide: getModelToken(Order.name), useValue: orders },
      { provide: getModelToken(Guide.name), useValue: guides },
      { provide: getModelToken(SalesRecord.name), useValue: sales },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => config[key] },
      },
    ],
  }).compile();

  return { service: moduleRef.get(SeedService), users, lots, orders, guides };
}

const dev = {
  nodeEnv: 'development',
  'seed.adminEmail': 'admin@test.cl',
  'seed.adminPassword': 'Admin123!',
  'seed.operatorPassword': 'Operador123!',
  'seed.demoData': true,
};

describe('SeedService (A-09)', () => {
  jest.setTimeout(20000); // bcrypt at cost 12, three hashes

  it('does nothing when users already exist', async () => {
    const { service, users, lots } = await build(dev);
    users.docs.push({ email: 'someone@test.cl' });
    await service.onModuleInit();
    expect(users.docs).toHaveLength(1);
    expect(lots.docs).toHaveLength(0);
  });

  it('refuses to bootstrap production without an admin password', async () => {
    const { service, users } = await build({
      ...dev,
      nodeEnv: 'production',
      'seed.adminPassword': '',
      'seed.demoData': false,
    });
    await expect(service.onModuleInit()).rejects.toThrow(
      /SEED_ADMIN_PASSWORD is required/,
    );
    expect(users.docs).toHaveLength(0);
  });

  it('refuses the development default password in production', async () => {
    const { service, users } = await build({
      ...dev,
      nodeEnv: 'production',
      'seed.demoData': false,
    });
    await expect(service.onModuleInit()).rejects.toThrow(/development default/);
    expect(users.docs).toHaveLength(0);
  });

  it('creates only the admin when demo data is disabled', async () => {
    const { service, users, lots, orders, guides } = await build({
      ...dev,
      nodeEnv: 'production',
      'seed.adminPassword': 's3cret-prod-pass',
      'seed.demoData': false,
    });
    await service.onModuleInit();
    expect(users.docs.map((u) => u.role)).toEqual(['admin']);
    expect(users.docs[0].password).not.toBe('s3cret-prod-pass');
    expect(lots.docs).toHaveLength(0);
    expect(orders.docs).toHaveLength(0);
    expect(guides.docs).toHaveLength(0);
  });

  it('seeds demo data with a distinct hash per user', async () => {
    const { service, users, lots, orders, guides } = await build(dev);
    await service.onModuleInit();

    expect(users.docs.map((u) => u.role)).toEqual([
      'admin',
      'operator',
      'operator',
    ]);
    const hashes = users.docs.map((u) => u.password);
    expect(new Set(hashes).size).toBe(3);

    expect(lots.docs).toHaveLength(16);
    expect(orders.docs).toHaveLength(4);
    expect(guides.docs).toHaveLength(3);
  });
});
