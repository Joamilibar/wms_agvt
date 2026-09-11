import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from './counter.schema.js';

@Injectable()
export class CountersService {
  constructor(
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
  ) {}

  /**
   * Atomically reserves the next number in a sequence.
   *
   * Replaces `countDocuments() + 1`, which handed the same number to two
   * concurrent creates (one then died on the unique index with an opaque 500),
   * reused folios after any deletion, and — being a global count — did not
   * restart at 001 in a new year.
   *
   * @param key      sequence name, e.g. "ORD-2026"
   * @param seedFrom called only when the sequence does not exist yet, so that
   *                 documents created before this counter existed are not
   *                 numbered over
   */
  async next(key: string, seedFrom?: () => Promise<number>): Promise<number> {
    if (seedFrom) {
      const existing = await this.counterModel.findOne({ key }).exec();
      if (!existing) {
        const start = await seedFrom();
        // $setOnInsert makes a concurrent double-seed harmless.
        await this.counterModel
          .updateOne({ key }, { $setOnInsert: { seq: start } }, { upsert: true })
          .exec();
      }
    }

    const doc = await this.counterModel
      .findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true })
      .exec();

    if (!doc) {
      throw new Error('Counter ' + key + ' could not be reserved');
    }
    return doc.seq;
  }
}
