import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SheetingMastersService } from './sheeting-masters.service.js';
import type { SheetingModel } from '../schemas/sheeting-model.schema.js';
import { UpsertFabricDto, SaveModelDto, QuoteDto, UpsertRateDto, PreviewModelDto, DuplicateModelDto } from '../dto/sheeting.dto.js';
import { blockCatalogue } from './blocks.js';
import { evaluatePanels } from './geometry.js';
import { getErrorDetails } from './errors.js';
import { WorkshopRatesService } from './workshop-rates.service.js';
import { SheetingCalcService } from './sheeting-calc.service.js';

/**
 * Sheeting consumption and quoting. Its own controller on purpose:
 * `PlanningController` already carries ~40 routes.
 */
@ApiTags('Sabanería')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('planning/sheeting')
export class SheetingController {
  constructor(private masters: SheetingMastersService, private calc: SheetingCalcService, private rates: WorkshopRatesService) {}

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

  @Get('blocks')
  @ApiOperation({ summary: 'Catálogo de bloques del constructor y sus parámetros' })
  blocks() {
    return blockCatalogue();
  }

  @Post('models/preview')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Compila los bloques y corre el encaje y el costo sobre medidas de muestra, sin persistir' })
  async preview(@Body() dto: PreviewModelDto) {
    const { panels, vars } = this.masters.resolveGeometry(dto);
    const sample = { ...(dto.sampleVars ?? {}), ...(dto.measures ?? {}) };
    const problems = this.masters.problemsOver(panels, vars, sample, dto.validRange ?? {});
    const out: Record<string, unknown> = { panels, vars, panelsText: this.masters.describePanels(panels), problems, sample };
    if (problems.length) return { ...out, cut: null, quote: null, quoteError: null };
    out.cut = evaluatePanels(panels, { ...vars, ...sample });
    const fabrics = await this.masters.fabrics();
    const fabricSku = dto.fabricSku ?? fabrics[0]?.sku;
    const workshops = (await this.rates.list()).map((r) => r.workshop);
    const workshop = dto.workshop ?? workshops[0] ?? '';
    if (!fabricSku || !workshop) return { ...out, quote: null, quoteError: { code: !fabricSku ? 'NO_FABRIC' : 'NO_WORKSHOP' } };
    const draft = { code: dto.code, version: 0, name: dto.name, family: dto.family, vars, panels, validRange: dto.validRange ?? {}, cutBatchUnits: dto.cutBatchUnits ?? 20, supplies: (dto.supplies ?? []).map((s) => ({ ...s, name: s.name ?? '' })), packagingClp: dto.packagingClp ?? 0, freightClp: dto.freightClp ?? 0 };
    try {
      const quote = await this.calc.quoteFor(draft, { modelCode: dto.code, fabricSku, frameFabricSku: dto.frameFabricSku, measures: sample, qty: 1, workshop, channel: dto.channel ?? 'tienda', sizeLabel: dto.sizeLabel ?? null });
      return { ...out, quote, quoteError: null };
    } catch (e) {
      return { ...out, quote: null, quoteError: getErrorDetails(e) };
    }
  }

  @Post('models/:code/duplicate')
  @Roles('admin')
  @ApiOperation({ summary: 'Copia la versión activa como versión 1 de un código nuevo' })
  duplicate(@Param('code') code: string, @Body() dto: DuplicateModelDto, @CurrentUser('email') email: string) {
    return this.masters.duplicateModel(code, dto.code, dto.name, email ?? 'unknown');
  }

  @Post('models')
  @Roles('admin')
  @ApiOperation({ summary: 'Valida y crea la siguiente versión del modelo; la anterior deja de estar activa' })
  saveModel(@Body() dto: SaveModelDto, @CurrentUser('email') email: string) {
    return this.masters.saveModel(dto, email ?? 'unknown');
  }

  @Post('seed')
  @Roles('admin')
  @ApiOperation({ summary: 'Carga telas, modelos de referencia y tarifas de la hoja (idempotente)' })
  async seed(@CurrentUser('email') email: string) {
    const masters = await this.masters.seed(email ?? 'seed');
    const rates = await this.rates.seed(email ?? 'seed');
    return { ...masters, rates };
  }

  // ── workshop rates ─────────────────────────────────────────────────────────

  @Get('rates')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Tarifas de taller vigentes (o todas con all=true)' })
  rateList(@Query('workshop') workshop?: string, @Query('modelCode') modelCode?: string, @Query('all') all?: string) {
    return this.rates.list({ workshop, modelCode, all: all === 'true' });
  }

  @Post('rates')
  @Roles('admin')
  @ApiOperation({ summary: 'Nueva versión de una tarifa (taller, modelo, talla, calidad); la anterior queda inactiva' })
  upsertRate(@Body() dto: UpsertRateDto, @CurrentUser('email') email: string) {
    return this.rates.upsert(dto, email ?? 'unknown');
  }

  // ── quote ──────────────────────────────────────────────────────────────────

  @Post('quote')
  @ApiOperation({ summary: 'Calcula consumo y costo sin persistir. Idempotente; es lo que usa la pantalla mientras se tipea' })
  quote(@Body() dto: QuoteDto) {
    return this.calc.quote(dto);
  }
}
