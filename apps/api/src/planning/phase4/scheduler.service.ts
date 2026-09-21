import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SALES_HISTORY_QUEUE, MONTHLY_CLOSE_JOB } from '../sales-history/sales-history.processor.js';

/**
 * The month closes by itself: on the 1st at 03:00 the last two months of
 * sales are reloaded from BSale and the forecasts of the closed month get
 * their actuals. BullMQ keeps the schedule in Redis, so a restart does not
 * lose it and two instances do not both run it.
 */
@Injectable()
export class PlanningScheduler implements OnModuleInit {
  private readonly logger = new Logger(PlanningScheduler.name);

  constructor(@InjectQueue(SALES_HISTORY_QUEUE) private queue: Queue) {}

  async onModuleInit() {
    try {
      await this.queue.add(MONTHLY_CLOSE_JOB, {}, {
        repeat: { pattern: '0 3 1 * *', tz: 'America/Santiago' },
        jobId: MONTHLY_CLOSE_JOB,
        removeOnComplete: 12,
        removeOnFail: 12,
      });
      this.logger.log('Monthly close scheduled: 1st of each month, 03:00 America/Santiago');
    } catch (e) {
      // Without Redis the module still serves; only the automation is lost.
      this.logger.warn(`Monthly close not scheduled: ${(e as Error).message}`);
    }
  }
}
