import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { OrdersService } from './orders.service.js';
import { Order } from './schemas/order.schema.js';
import { SalesRecord } from '../analytics/schemas/sales-record.schema.js';
import { StockService } from '../stock/stock.service.js';
import { BsaleService } from '../bsale/bsale.service.js';
import { PickingLogService } from '../picking-log/picking-log.service.js';
import { CountersService } from '../common/counters/counters.service.js';
import { GuidesService } from '../guides/guides.service.js';
import { GUIDE_SYNC_QUEUE } from '../guides/guide-sync.processor.js';
import { CacheService } from '../common/cache/cache.service.js';

/**
 * A-06 regression.
 *
 * `session.withTransaction` re-runs its callback on transient errors (write
 * conflicts, primary elections). The callback must therefore be idempotent.
 * It was not: the order document was loaded *outside* the session and reused
 * across attempts, so `item.pickedQty += consumed` accumulated once per attempt
 * and the order claimed twice what actually left the warehouse.
 *
 * The fake session below runs the callback twice — exactly what a single
 * transient retry looks like — while the fake model keeps returning the
 * committed (pre-transaction) state, which is what a rolled-back attempt leaves
 * behind. A correct callback produces the same result either way.
 */

// Mongoose casts these into ObjectIds, so they must be real 24-char hex.
const ORDER_ID = '507f1f77bcf86cd799439011';
const LOT_ID = '507f1f77bcf86cd799439099';
const GUIDE_ID = '507f1f77bcf86cd7994390aa';
const USER_ID = '507f191e810c19729de860ea';

const COMMITTED = {
  _id: ORDER_ID,
  status: 'in_progress',
  warehouse: 'Central',
  originType: 'manual',
  guideId: null,
  client: 'Restaurante Los Robles',
  bsaleDocumentId: null,
  bsaleDocumentNumber: null,
  bsaleOfficeId: 3,
  items: [
    {
      sku: 'SKU-001',
      name: 'Merluza 1kg',
      requestedQty: 10,
      pickedQty: 0,
      status: 'pending',
      lots: [],
      // A-05: what this order is holding, to be released on picking.
      reservedLots: [{ lotId: LOT_ID, lot: 'L-001', entryDate: '2026-01-01', qty: 5 }],
    },
  ],
};

const clone = () => JSON.parse(JSON.stringify(COMMITTED));

describe('OrdersService.processFIFO', () => {
  let service: OrdersService;
  let testingModule: TestingModule;
  let saved: any[];
  let attempts: number;
  let insertedSales: any[][];
  let pickingLogs: any[];
  let released: { lotId: string; qty: number }[][];
  let createdGuides: any[];
  let queuedJobs: { name: string; data: any; opts: any }[];
  let orderUpdates: any[];
  let orderOverrides: Record<string, unknown>;
  let bsaleDouble: { isConfigured: () => boolean; generateGuide: jest.Mock };

  beforeEach(async () => {
    saved = [];
    insertedSales = [];
    pickingLogs = [];
    released = [];
    createdGuides = [];
    queuedJobs = [];
    orderUpdates = [];
    orderOverrides = {};
    bsaleDouble = { isConfigured: () => true, generateGuide: jest.fn() };
    attempts = 0;

    const makeDoc = () => {
      const doc: any = { ...clone(), ...orderOverrides };
      doc.save = jest.fn(async () => {
        // Record the snapshot instead of mutating COMMITTED: an attempt that is
        // retried was rolled back, so the next read must not see it.
        saved.push(JSON.parse(JSON.stringify({ status: doc.status, items: doc.items })));
        return doc;
      });
      return doc;
    };

    const orderModel: any = {
      findById: () => ({
        session: () => ({ exec: async () => makeDoc() }),
        exec: async () => makeDoc(),
      }),
      updateOne: (filter: any, update: any) => ({
        exec: async () => {
          orderUpdates.push({ filter, update });
          return { matchedCount: 1, modifiedCount: 1 };
        },
      }),
    };

    const salesModel: any = {
      insertMany: jest.fn(async (rows: any[]) => {
        insertedSales.push(rows);
        return rows;
      }),
    };

    const stockService: any = {
      startSession: async () => ({
        // One transient retry: the callback runs twice, commits once.
        withTransaction: async (cb: () => Promise<void>) => {
          attempts = 0;
          await cb();
          attempts++;
          await cb();
          attempts++;
        },
        endSession: async () => undefined,
      }),
      releaseReservations: jest.fn(async (lots: { lotId: string; qty: number }[]) => {
        released.push(lots);
        return lots.reduce((s, l) => s + l.qty, 0);
      }),
      processFIFO: jest.fn(async (_sku: string, qty: number) => ({
        consumed: [
          {
            lotId: 'lot-a',
            lot: 'L-001',
            entryDate: new Date('2026-01-01'),
            qty,
            unitCost: 1000,
            bsaleProductId: '4321',
            rack: 'A',
            col: '1',
            row: '2',
            pallet: 'P1',
          },
        ],
        deficit: 0,
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(SalesRecord.name), useValue: salesModel },
        { provide: StockService, useValue: stockService },
        { provide: BsaleService, useValue: bsaleDouble },
        {
          provide: PickingLogService,
          useValue: {
            create: jest.fn(async (log: any) => {
              pickingLogs.push(log);
              return log;
            }),
          },
        },
        { provide: CountersService, useValue: { next: jest.fn(async () => 1) } },
        {
          provide: CacheService,
          useValue: {
            wrap: jest.fn(async (_k: string, _t: number, produce: () => Promise<unknown>) => produce()),
            invalidate: jest.fn(async () => 0),
          },
        },
        {
          provide: GuidesService,
          useValue: {
            createFromOrder: jest.fn(async (data: any) => {
              createdGuides.push(data);
              return { _id: GUIDE_ID, guideId: 'GD-2026-001' };
            }),
          },
        },
        {
          provide: getQueueToken(GUIDE_SYNC_QUEUE),
          useValue: {
            add: jest.fn(async (name: string, data: any, opts: any) => {
              // BullMQ usa ':' para separar claves en Redis y rechaza un jobId
              // que lo contenga. El doble impone la misma regla: sin esto, la
              // clave de idempotencia compilaba y moria en runtime.
              if (opts?.jobId && String(opts.jobId).includes(':')) {
                throw new Error('Custom Id cannot contain :');
              }
              queuedJobs.push({ name, data, opts });
              return { id: opts?.jobId };
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
    testingModule = moduleRef;
  });

  afterEach(async () => {
    await testingModule?.close();
  });

  it('records what was picked once, even when the transaction is retried', async () => {
    await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

    expect(attempts).toBe(2); // the retry really happened

    const committedState = saved[saved.length - 1];
    // 5 units left the warehouse. Accumulating across attempts would say 10.
    expect(committedState.items[0].pickedQty).toBe(5);
    expect(committedState.items[0].status).toBe('partial');
    expect(committedState.status).toBe('in_progress');
  });

  it('does not duplicate SalesRecord rows across attempts', async () => {
    await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

    // One insertMany per attempt, each holding exactly this attempt's lines.
    for (const rows of insertedSales) {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ sku: 'SKU-001', qty: 5, unitPrice: 1000, warehouse: 'Central' });
    }
  });

  it('does not duplicate picking-log lines across attempts', async () => {
    await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

    expect(pickingLogs).toHaveLength(1);
    expect(pickingLogs[0].items).toHaveLength(1);
    expect(pickingLogs[0].items[0]).toMatchObject({ sku: 'SKU-001', qty: 5, lot: 'L-001' });
  });

  // ── A-05 ────────────────────────────────────────────────────────────────
  it('releases the order own reservation before consuming, once per attempt', async () => {
    await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

    // Once per attempt, and each time exactly the committed ledger — never the
    // leftovers of a rolled-back attempt.
    expect(released).toHaveLength(2);
    for (const batch of released) {
      expect(batch).toEqual([{ lotId: LOT_ID, qty: 5 }]);
    }
  });

  // ── A-01 ────────────────────────────────────────────────────────────────
  describe('when the order must generate a BSale dispatch guide', () => {
    beforeEach(() => {
      orderOverrides = { originType: 'bsale_factura', bsaleDocumentNumber: '12345' };
    });

    it('creates exactly one guide, links it, and queues the emission', async () => {
      await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

      // One guide even though the transaction ran twice.
      expect(createdGuides).toHaveLength(1);
      expect(createdGuides[0].items[0]).toMatchObject({
        sku: 'SKU-001',
        qty: 5,
        // A-02: the real variant id from the lot, not the digits of the SKU.
        bsaleVariantId: '4321',
      });
      expect(createdGuides[0].bsaleReferenceCodeSii).toBe(33);

      // Linked to the order straight away, so a repeated call cannot emit again.
      expect(orderUpdates).toHaveLength(1);
      expect(orderUpdates[0].update.$set.guideId).toBe(GUIDE_ID);

      // Queued, not emitted inline, with the guide id as idempotency key.
      expect(queuedJobs).toHaveLength(1);
      expect(queuedJobs[0].name).toBe('emit-guide');
      expect(queuedJobs[0].opts.jobId).toBe('emit-guide-' + GUIDE_ID);
      expect(queuedJobs[0].opts.attempts).toBeGreaterThan(1);
    });

    it('never calls BSale inside the picking request', async () => {
      await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

      expect(bsaleDouble.generateGuide).not.toHaveBeenCalled();
    });
  });

  // ── Precio del SalesRecord ───────────────────────────────────────────────
  describe('the price a SalesRecord is written with', () => {
    it('uses the BSale sale price captured on the order line', async () => {
      orderOverrides = {
        items: [{
          sku: 'SKU-001',
          name: 'Merluza 1kg',
          requestedQty: 10,
          pickedQty: 0,
          status: 'pending',
          lots: [],
          reservedLots: [],
          unitPrice: 7400,
          priceSource: 'bsale_document',
        }],
      };

      await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

      // The sale price, not the lot cost of 1000: the ABC weighs revenue.
      expect(insertedSales[0][0]).toMatchObject({
        unitPrice: 7400,
        priceSource: 'bsale_document',
      });
    });

    it('falls back to the lot cost and says so when there is no sale price', async () => {
      // A manual order carries no BSale document, so no price came with it.
      await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 5 }], USER_ID);

      expect(insertedSales[0][0]).toMatchObject({
        unitPrice: 1000,
        priceSource: 'lot_cost',
      });
    });
  });

  it('completes the order when the full requested quantity is picked', async () => {
    await service.processFIFO(ORDER_ID, [{ sku: 'SKU-001', qty: 10 }], USER_ID);

    const committedState = saved[saved.length - 1];
    expect(committedState.items[0].pickedQty).toBe(10);
    expect(committedState.items[0].status).toBe('completed');
    expect(committedState.status).toBe('completed');
  });
});
