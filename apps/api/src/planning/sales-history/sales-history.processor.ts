import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SalesHistoryService } from './sales-history.service.js';

export const SALES_HISTORY_QUEUE = 'planning-sales-history';

export interface LoadHistoryJob {
  from: string; // YYYY-MM-DD
  to: string;
  requestedBy: string;
}

/**
 * The load reads ~5.000 documents page by page from BSale; like the stock
 * sync it runs as a job, never inside the request.
 */
@Processor(SALES_HISTORY_QUEUE)
export class SalesHistoryProcessor extends WorkerHost {
  private readonly logger = new Logger(SalesHistoryProcessor.name);

  constructor(private service: SalesHistoryService) {
    super();
  }

  async process(job: Job<LoadHistoryJob>) {
    const { from, to, requestedBy } = job.data;
    this.logger.log(`Sales history job ${job.id}: ${from} → ${to} (attempt ${job.attemptsMade + 1})`);
    return this.service.loadFromBsale(new Date(from + 'T00:00:00Z'), new Date(to + 'T00:00:00Z'), requestedBy);
  }
}
