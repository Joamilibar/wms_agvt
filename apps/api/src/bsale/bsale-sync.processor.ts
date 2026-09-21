import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BsaleService } from './bsale.service.js';

export const BSALE_SYNC_QUEUE = 'bsale-sync';

export interface SyncStockJob {
  clearExisting: boolean;
  requestedBy: string;
}

/** Job name: value every active lot at BSale's average cost per SKU. */
export const SYNC_COSTS_JOB = 'sync-costs';

/**
 * Runs the BSale stock sync off the request thread.
 *
 * M-07: BullMQ was wired to Redis but had no queue and no processor, so
 * `syncStockFromBsale` paginated the whole BSale catalogue synchronously inside
 * the HTTP request — the UI itself warned it "may take several minutes" — with
 * no way to retry and a proxy timeout waiting at the end.
 */
@Processor(BSALE_SYNC_QUEUE)
export class BsaleSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BsaleSyncProcessor.name);

  constructor(private bsaleService: BsaleService) {
    super();
  }

  async process(job: Job<SyncStockJob>) {
    if (job.name === SYNC_COSTS_JOB) return this.bsaleService.syncCostsFromBsale(job.data.requestedBy);
    const { clearExisting, requestedBy } = job.data;
    this.logger.log(
      `Starting BSale stock sync (job ${job.id}, clearExisting=${clearExisting}, ` +
      `attempt ${job.attemptsMade + 1})`,
    );

    const result = await this.bsaleService.syncStockFromBsale(clearExisting, requestedBy);

    this.logger.log(
      `BSale stock sync ${job.id} finished: archived=${result.archived} ` +
      `created=${result.created} skipped=${result.skipped} errors=${result.errors.length}`,
    );

    return result;
  }
}
