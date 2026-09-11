import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GuidesService } from './guides.service.js';

export const GUIDE_SYNC_QUEUE = 'guide-sync';

export interface EmitGuideJob {
  guideId: string;
}

/**
 * Pushes dispatch guides to BSale outside the request that created them.
 *
 * A-01: emission used to happen inline, before the inventory transaction, with
 * no record of the result — so a failed transaction left an orphan tax document
 * and every retry emitted another. Here it is a queued job with bounded retries,
 * and `GuidesService.emitToBsale` is idempotent, so a duplicate delivery
 * converges on the same BSale document instead of creating a second one.
 */
@Processor(GUIDE_SYNC_QUEUE)
export class GuideSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GuideSyncProcessor.name);

  constructor(private guidesService: GuidesService) {
    super();
  }

  async process(job: Job<EmitGuideJob>): Promise<{ guideId: string; bsaleStatus: string }> {
    const { guideId } = job.data;
    this.logger.log(`Emitting guide ${guideId} to BSale (attempt ${job.attemptsMade + 1})`);

    const guide = await this.guidesService.emitToBsale(guideId);

    return { guideId, bsaleStatus: guide.bsaleStatus };
  }
}
