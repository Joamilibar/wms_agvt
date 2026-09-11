import { Test } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { StockService } from './stock.service.js';
import { StockLot } from './schemas/stock-lot.schema.js';

/**
 * A minimal in-memory stand-in for the Mongoose model, supporting exactly the
 * two operations processFIFO performs: a sorted find and a filtered updateOne.
 * Using a fake store rather than jest.fn() stubs means these tests exercise the
 * real FIFO ordering and the real update *filter* — which is the whole point of
 * the A-04 regression below.
 */
type Lot = {
  _id: string;
  sku: string;
  warehouse: string;
  lot: string;
  entryDate: Date;
  qty: number;
  unitCost: number;
  reservedQty: number;
  isActive: boolean;
  rack?: string;
  col?: string;
  row?: string;
  pallet?: string;
};

function matches(doc: any, filter: any): boolean {
  return Object.entries(filter).every(([key, cond]: [string, any]) => {
    const value = doc[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, operand]: [string, any]) => {
        if (op === '$gt') return value > operand;
        if (op === '$gte') return value >= operand;
        if (op === '$lt') return value < operand;
        if (op === '$lte') return value <= operand;
        throw new Error('unsupported operator in fake model: ' + op);
      });
    }
    return value === cond;
  });
}

/** Evaluates the handful of aggregation operators the service actually uses. */
function evalExpr(expr: any, doc: any): any {
  if (typeof expr === 'number') return expr;
  if (typeof expr === 'string') return expr.startsWith('$') ? doc[expr.slice(1)] : expr;
  if (expr.$max) return Math.max(...expr.$max.map((e: any) => evalExpr(e, doc)));
  if (expr.$subtract) {
    const [a, b] = expr.$subtract.map((e: any) => evalExpr(e, doc));
    return a - b;
  }
  throw new Error('unsupported expression in fake model: ' + JSON.stringify(expr));
}

class FakeLotModel {
  lots: Lot[] = [];
  /** Fires right before an updateOne is applied, to simulate a concurrent writer. */
  onBeforeUpdate: (() => void) | null = null;

  find(filter: any) {
    const run = () => this.lots.filter((l) => matches(l, filter));
    const chain: any = {
      sort: (spec: any) => {
        const key = Object.keys(spec)[0];
        const dir = spec[key];
        chain._sort = (a: any, b: any) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0);
        return chain;
      },
      session: () => chain,
      exec: async () => {
        const out = run();
        return chain._sort ? out.sort(chain._sort) : out;
      },
    };
    return chain;
  }

  updateOne(filter: any, update: any, opts?: any) {
    return {
      exec: async () => {
        if (this.onBeforeUpdate) {
          const hook = this.onBeforeUpdate;
          this.onBeforeUpdate = null;
          hook();
        }

        // Mirror Mongoose: an array is a pipeline update and is rejected unless
        // declared as one. A permissive double let this ship and only runtime
        // caught it, so the double now enforces the same rule.
        if (Array.isArray(update)) {
          if (!opts?.updatePipeline) {
            throw new Error(
              'Cannot pass an array to query updates unless the `updatePipeline` option is set',
            );
          }
          const doc = this.lots.find((l) => matches(l, filter));
          if (!doc) return { matchedCount: 0, modifiedCount: 0 };
          for (const stage of update) {
            for (const [field, expr] of Object.entries(stage.$set || {})) {
              (doc as any)[field] = evalExpr(expr, doc);
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        }

        const doc = this.lots.find((l) => matches(l, filter));
        if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) (doc as any)[k] += v as number;
        }
        if (update.$set) Object.assign(doc, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };
  }
}

const lot = (over: Partial<Lot> & { _id: string; entryDate: Date; qty: number }): Lot => ({
  sku: 'SKU-001',
  warehouse: 'Central',
  unitCost: 1000,
  reservedQty: 0,
  lot: 'L-' + over._id,
  isActive: true,
  ...over,
});

describe('StockService.processFIFO', () => {
  let service: StockService;
  let model: FakeLotModel;
  const session: any = {};

  beforeEach(async () => {
    model = new FakeLotModel();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: getModelToken(StockLot.name), useValue: model },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(StockService);
  });

  it('consumes a single lot exactly and deactivates it', async () => {
    model.lots = [lot({ _id: 'a', entryDate: new Date('2026-01-01'), qty: 10 })];

    const res = await service.processFIFO('SKU-001', 10, 'Central', session);

    expect(res.deficit).toBe(0);
    expect(res.consumed).toHaveLength(1);
    expect(res.consumed[0].qty).toBe(10);
    expect(model.lots[0].qty).toBe(0);
    expect(model.lots[0].isActive).toBe(false);
    // A-08 depends on the unit cost reaching the consumption record
    expect(res.consumed[0].unitCost).toBe(1000);
  });

  it('consumes oldest-first across several lots', async () => {
    model.lots = [
      lot({ _id: 'new', entryDate: new Date('2026-03-01'), qty: 100 }),
      lot({ _id: 'old', entryDate: new Date('2026-01-01'), qty: 4 }),
      lot({ _id: 'mid', entryDate: new Date('2026-02-01'), qty: 3 }),
    ];

    const res = await service.processFIFO('SKU-001', 10, 'Central', session);

    expect(res.deficit).toBe(0);
    expect(res.consumed.map((c) => c.lotId)).toEqual(['old', 'mid', 'new']);
    expect(res.consumed.map((c) => c.qty)).toEqual([4, 3, 3]);
    expect(model.lots.find((l) => l._id === 'new')!.qty).toBe(97);
  });

  it('reports a deficit and still consumes everything available', async () => {
    model.lots = [
      lot({ _id: 'a', entryDate: new Date('2026-01-01'), qty: 2 }),
      lot({ _id: 'b', entryDate: new Date('2026-02-01'), qty: 3 }),
    ];

    const res = await service.processFIFO('SKU-001', 12, 'Central', session);

    expect(res.deficit).toBe(7);
    expect(res.consumed.reduce((s, c) => s + c.qty, 0)).toBe(5);
    expect(model.lots.every((l) => l.qty === 0 && !l.isActive)).toBe(true);
  });

  it('ignores other SKUs, other warehouses, inactive and empty lots', async () => {
    model.lots = [
      lot({ _id: 'other-sku', sku: 'SKU-999', entryDate: new Date('2026-01-01'), qty: 50 }),
      lot({ _id: 'other-wh', warehouse: 'Norte', entryDate: new Date('2026-01-02'), qty: 50 }),
      lot({ _id: 'inactive', isActive: false, entryDate: new Date('2026-01-03'), qty: 50 }),
      lot({ _id: 'empty', entryDate: new Date('2026-01-04'), qty: 0 }),
      lot({ _id: 'good', entryDate: new Date('2026-01-05'), qty: 6 }),
    ];

    const res = await service.processFIFO('SKU-001', 6, 'Central', session);

    expect(res.consumed.map((c) => c.lotId)).toEqual(['good']);
    expect(res.deficit).toBe(0);
  });

  // ── A-05: giving reservations back ───────────────────────────────────────
  describe('releaseReservations', () => {
    it('returns the promised units to the pool', async () => {
      model.lots = [lot({ _id: 'a', entryDate: new Date('2026-01-01'), qty: 10 })];
      model.lots[0].reservedQty = 4;

      const released = await service.releaseReservations([{ lotId: 'a', qty: 3 }]);

      expect(released).toBe(3);
      expect(model.lots[0].reservedQty).toBe(1);
    });

    it('clamps at zero instead of going negative when the ledger has drifted', async () => {
      model.lots = [lot({ _id: 'a', entryDate: new Date('2026-01-01'), qty: 10 })];
      model.lots[0].reservedQty = 2;

      // The order thinks it holds 5, the lot only has 2 reserved.
      await service.releaseReservations([{ lotId: 'a', qty: 5 }]);

      expect(model.lots[0].reservedQty).toBe(0);
    });

    it('ignores empty and non-positive entries', async () => {
      model.lots = [lot({ _id: 'a', entryDate: new Date('2026-01-01'), qty: 10 })];
      model.lots[0].reservedQty = 4;

      const released = await service.releaseReservations([{ lotId: 'a', qty: 0 }]);

      expect(released).toBe(0);
      expect(model.lots[0].reservedQty).toBe(4);
    });
  });

  // ── A-04 regression ──────────────────────────────────────────────────────
  // Two pickings hit the same lot. The second one has already read qty=10 when
  // the first drains it. An unguarded $inc leaves the lot at -10.
  it('never drives a lot negative when the balance moves under it', async () => {
    model.lots = [lot({ _id: 'contended', entryDate: new Date('2026-01-01'), qty: 10 })];
    model.onBeforeUpdate = () => {
      model.lots[0].qty = 0;
      model.lots[0].isActive = false;
    };

    await expect(
      service.processFIFO('SKU-001', 10, 'Central', session),
    ).rejects.toThrow(/concurrent|conflict|stock/i);

    expect(model.lots[0].qty).toBeGreaterThanOrEqual(0);
  });
});
