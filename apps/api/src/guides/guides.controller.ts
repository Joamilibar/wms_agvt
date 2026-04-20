import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuidesService } from './guides.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Guides')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guides')
export class GuidesController {
  constructor(private guidesService: GuidesService) {}

  @Get()
  @ApiOperation({ summary: 'List guides (paginated)' })
  async findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.guidesService.findAll({ type, status, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get guide by ID' })
  async findById(@Param('id') id: string) {
    return this.guidesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new guide' })
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser('userId') userId: string,
  ) {
    return this.guidesService.create({ ...body, emittedBy: userId } as any);
  }

  @Patch(':id/emit')
  @ApiOperation({ summary: 'Emit a guide (draft → emitted)' })
  async emit(@Param('id') id: string) {
    return this.guidesService.emit(id);
  }

  @Patch(':id/receive')
  @ApiOperation({ summary: 'Mark guide as received' })
  async receive(@Param('id') id: string) {
    return this.guidesService.receive(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a guide' })
  async cancel(@Param('id') id: string) {
    return this.guidesService.cancel(id);
  }
}
