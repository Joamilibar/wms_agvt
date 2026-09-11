import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BsaleService } from './bsale.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BSALE_SYNC_QUEUE } from './bsale-sync.processor.js';

@ApiTags('BSale')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bsale')
export class BsaleController {
  constructor(
    private bsaleService: BsaleService,
    @InjectQueue(BSALE_SYNC_QUEUE) private syncQueue: Queue,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'BSale connection status' })
  async getStatus() {
    return this.bsaleService.getStatus();
  }

  @Post('test-connection')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Test BSale API connection' })
  async testConnection() {
    return this.bsaleService.testConnection();
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get active documents from BSale (with search)' })
  async getDocuments(
    @Query('limit') limit?: number,
    @Query('officeid') officeid?: string,
    @Query('number') number?: string,
  ) {
    return this.bsaleService.getDocuments({ limit: limit || 25, officeid, number });
  }

  @Get('offices')
  @ApiOperation({ summary: 'Get BSale offices' })
  async getOffices() {
    return this.bsaleService.getOffices();
  }

  @Get('clients')
  @ApiOperation({ summary: 'Get BSale clients (searchable by company name)' })
  async getClients(@Query('q') q?: string) {
    return this.bsaleService.getClients(q);
  }

  @Get('documents/:id/details')
  @ApiOperation({ summary: 'Get details of a BSale document' })
  async getDocumentDetails(@Param('id') id: string) {
    return this.bsaleService.getDocumentDetails(parseInt(id, 10));
  }

  @Get('stocks/bulk')
  @ApiOperation({ summary: 'Get stock for multiple variants in an office' })
  async getStocksBulk(
    @Query('officeid') officeid: string,
    @Query('variantids') variantids: string,
  ) {
    if (!officeid || !variantids) return {};
    return this.bsaleService.getStocksForVariants(officeid, variantids.split(',').filter(Boolean));
  }

  @Post('sync-stock')
  @Roles('admin')
  @ApiOperation({
    summary: 'Queue a BSale stock sync',
    description:
      'Returns immediately with a jobId. M-07: this used to paginate the whole ' +
      'BSale catalogue inside the request. Poll GET /api/bsale/sync-jobs/:id ' +
      'for progress. clearExisting must be literal true to archive current lots.',
  })
  async syncStock(
    @Body() body: { clearExisting?: boolean },
    @CurrentUser('userId') userId: string,
  ) {
    const job = await this.syncQueue.add(
      'sync-stock',
      // Opt-in, not opt-out: an empty body used to wipe the whole inventory.
      { clearExisting: body?.clearExisting === true, requestedBy: userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    return { jobId: job.id, status: 'queued' };
  }

  @Get('sync-jobs')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'List recent BSale sync jobs and their state' })
  async getSyncJobs() {
    const jobs = await this.syncQueue.getJobs(
      ['active', 'waiting', 'delayed', 'completed', 'failed'],
      0,
      24,
      false,
    );

    return Promise.all(
      jobs.map(async (job) => ({
        jobId: job.id,
        name: job.name,
        state: await job.getState(),
        attemptsMade: job.attemptsMade,
        data: job.data,
        result: job.returnvalue ?? null,
        failedReason: job.failedReason ?? null,
        queuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      })),
    );
  }

  @Get('sync-jobs/:id')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'State and result of a single BSale sync job' })
  async getSyncJob(@Param('id') id: string) {
    const job = await this.syncQueue.getJob(id);
    if (!job) throw new NotFoundException('Sync job not found');

    return {
      jobId: job.id,
      name: job.name,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      data: job.data,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
      queuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
  }

  @Post('reconcile/:sku')
  @Roles('admin', 'supervisor')
  @ApiOperation({
    summary: 'Compare a SKU balance between WMS and BSale, optionally correcting it',
    description:
      'Read-only by default. Send { "apply": true } to move the WMS to BSale, ' +
      'which is the source of truth for quantity: the surplus becomes a new lot ' +
      'and the excess is drawn down oldest-first, never touching units already ' +
      'reserved by an order in progress. Lot history is preserved either way.',
  })
  async reconcile(
    @Param('sku') sku: string,
    @Body() body: { apply?: boolean },
  ) {
    return this.bsaleService.reconcileSku(sku, body?.apply === true);
  }
}
