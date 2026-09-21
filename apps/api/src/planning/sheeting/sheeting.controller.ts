import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SheetingMastersService } from './sheeting-masters.service.js';
import type { SheetingModel } from '../schemas/sheeting-model.schema.js';
import { UpsertFabricDto, SaveModelDto } from '../dto/sheeting.dto.js';

/**
 * Sheeting consumption and quoting. Its own controller on purpose:
 * `PlanningController` already carries ~40 routes.
 */
@ApiTags('Sabanería')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('planning/sheeting')
export class SheetingController {
  constructor(private masters: SheetingMastersService) {}

  // ── fabrics ────────────────────────────────────────────────────────────────

  @Get('fabrics')
  @ApiOperation({ summary: 'Telas con ancho de rollo' })
  fabrics(@Query('all') all?: string) {
    return this.masters.fabrics(all === 'true');
  }

  @Post('fabrics')
  @Roles('admin')
  upsertFabric(@Body() dto: UpsertFabricDto) {
    return this.masters.upsertFabric(dto);
  }

  // ── models ─────────────────────────────────────────────────────────────────

  @Get('models')
  @ApiOperation({ summary: 'Modelos activos con su geometría compilada' })
  async models(@Query('all') all?: string) {
    const items = await this.masters.models(all === 'true');
    return items.map((m) => ({ ...m.toObject<SheetingModel>(), panelsText: this.masters.describePanels(m.panels) }));
  }

  @Get('models/:code')
  @ApiOperation({ summary: 'Un modelo (versión activa o la indicada) con sus bloques, para reabrirlo' })
  async model(@Param('code') code: string, @Query('version') version?: string) {
    const m = await this.masters.model(code, version ? Number(version) : undefined);
    return { ...m.toObject<SheetingModel>(), panelsText: this.masters.describePanels(m.panels) };
  }

  @Post('models')
  @Roles('admin')
  @ApiOperation({ summary: 'Valida y crea la siguiente versión del modelo; la anterior deja de estar activa' })
  saveModel(@Body() dto: SaveModelDto, @CurrentUser('email') email: string) {
    return this.masters.saveModel(dto, email ?? 'unknown');
  }

  @Post('seed')
  @Roles('admin')
  @ApiOperation({ summary: 'Carga las telas y los modelos de referencia (idempotente)' })
  seed(@CurrentUser('email') email: string) {
    return this.masters.seed(email ?? 'seed');
  }
}
