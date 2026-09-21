import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SalesHistoryService } from './sales-history.service.js';
import { ForecastAccuracyService } from '../phase4/accuracy.service.js';

export const SALES_HISTORY_QUEUE = 'planning-sales-history';

export interface LoadHistoryJob {
  from: string; // YYYY-MM-DD
  to: string;
  requestedBy: string;
}

/** Repeatable job added by PlanningScheduler on the 1st of each month. */
export const MONTHLY_CLOSE_JOB = 'monthly-close';

/**
 * The load reads ~5.000 documents page by page from BSale; like the stock
 * sync it runs as a job, never inside the request.
 */
@Processor(SALES_HISTORY_QUEUE)
export class SalesHistoryProcessor extends WorkerHost {
  private readonly logger = new Logger(SalesHistoryProcessor.name);

  constructor(private service: SalesHistoryService, private accuracy: ForecastAccuracyService) {
    super();
  }

  async process(job: Job<LoadHistoryJob>) {
    if (job.name === MONTHLY_CLOSE_JOB) return this.monthlyClose();
    const { from, to, requestedBy } = job.data;
    this.logger.log(`Sales history job ${job.id}: ${from} → ${to} (attempt ${job.attemptsMade + 1})`);
    return this.service.loadFromBsale(new Date(from + 'T00:00:00Z'), new Date(to + 'T00:00:00Z'), requestedBy);
  }

  /**
   * Month close: reload the last two months (late credit notes, corrections)
   * and fill the actuals of every forecast whose month has ended.
   */
  private async monthlyClose() {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    const to = new Date(now.getTime() - 86400000);
    this.logger.log(`Monthly close: reloading ${from.toISOString().slice(0, 10)} -> ${to.toISOString().slice(0, 10)}`);
    const load = await this.service.loadFromBsale(from, to, 'scheduler');
    const closed = await this.accuracy.closeMonths(now);
    return { load, closed };
  }
}
