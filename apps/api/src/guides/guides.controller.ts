import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuidesService } from './guides.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateGuideDto } from './dto/create-guide.dto.js';
import { QueryGuidesDto } from './dto/query-guides.dto.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GUIDE_SYNC_QUEUE } from './guide-sync.processor.js';

@ApiTags('Guides')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('guides')
export class GuidesController {
  constructor(
    private guidesService: GuidesService,
    @InjectQueue(GUIDE_SYNC_QUEUE) private guideQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List guides (paginated)' })
  async findAll(@Query() query: QueryGuidesDto) {
    return this.guidesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get guide by ID' })
  async findById(@Param('id') id: string) {
    return this.guidesService.findById(id);
  }

  @Post()
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Create a new guide' })
  async create(
    @Body() body: CreateGuideDto,
    @CurrentUser('userId') userId: string,
  ) {
    // No `as any`: the DTO is the whitelist, so status / guideId / orderId /
    // emittedAt / bsale* stay server-owned.
    return this.guidesService.create({ ...body, emittedBy: userId });
  }

  @Patch(':id/emit')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Emit a guide (draft → emitted)' })
  async emit(@Param('id') id: string) {
    return this.guidesService.emit(id);
  }

  @Patch(':id/receive')
  @ApiOperation({ summary: 'Mark guide as received' })
  async receive(@Param('id') id: string) {
    return this.guidesService.receive(id);
  }

  @Post(':id/sync-bsale')
  @Roles('admin', 'supervisor')
  @ApiOperation({
    summary: 'Queue (or re-queue) this guide for emission in BSale',
    description:
      'Idempotent: a guide already synced is left alone. Use it to retry a ' +
      'guide left in bsaleStatus=error or pending.',
  })
  async syncBsale(@Param('id') id: string) {
    const guide = await this.guidesService.findById(id);

    if (guide.bsaleStatus === 'synced') {
      return { guideId: guide.guideId, bsaleStatus: 'synced', queued: false };
    }

    // El jobId es la clave de idempotencia, y un job fallido sobrevive en la cola
    // (removeOnFail). Sin quitarlo primero, reencolar es un no-op silencioso y
    // una guia en estado `error` no se puede reintentar nunca.
    const jobId = 'emit-guide-' + id;
    await this.guideQueue.remove(jobId).catch(() => undefined);

    await this.guideQueue.add(
      'emit-guide',
      { guideId: id },
      {
        // Same key the picking flow uses, so a retry cannot stack up jobs.
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    return { guideId: guide.guideId, bsaleStatus: guide.bsaleStatus, queued: true };
  }

  @Patch(':id/cancel')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Cancel a guide' })
  async cancel(@Param('id') id: string) {
    return this.guidesService.cancel(id);
  }
}
