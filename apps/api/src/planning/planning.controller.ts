import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { WarehousesService } from './masters/warehouses.service.js';
import { SuppliersService } from './masters/suppliers.service.js';
import { PlanningItemsService } from './masters/planning-items.service.js';
import { PlanningParamsService } from './masters/planning-params.service.js';
import { SalesHistoryService } from './sales-history/sales-history.service.js';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service.js';
import { SALES_HISTORY_QUEUE, LoadHistoryJob } from './sales-history/sales-history.processor.js';
import { historyWindow, HISTORY_FLOOR } from './history-window.js';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto.js';
import { BulkPlanningItemsDto, UpdatePlanningItemDto, QueryPlanningItemsDto } from './dto/planning-item.dto.js';
import { UpdateWarehouseDto, UpdateParamsDto, ChannelOverrideDto, LoadHistoryDto, SetEtaDto } from './dto/misc.dto.js';
import { CreatePurchaseOrderDto } from './dto/purchase-order.dto.js';
import type { PoStatus } from './schemas/purchase-order.schema.js';
import type { Channel } from './schemas/sales-history.schema.js';

@ApiTags('Planificación')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('planning')
export class PlanningController {
  constructor(
    private warehouses: WarehousesService,
    private suppliers: SuppliersService,
    private items: PlanningItemsService,
    private params: PlanningParamsService,
    private history: SalesHistoryService,
    private purchaseOrders: PurchaseOrdersService,
    @InjectQueue(SALES_HISTORY_QUEUE) private historyQueue: Queue<LoadHistoryJob>,
  ) {}

  // ── window ─────────────────────────────────────────────────────────────────

  @Get('window')
  @ApiOperation({ summary: 'Ventana de historia vigente (regla fija: desde 2025-01-01, máx. 24 meses, hasta fin del mes anterior)' })
  window() {
    return historyWindow();
  }

  // ── warehouses ─────────────────────────────────────────────────────────────

  @Get('warehouses')
  @ApiOperation({ summary: 'Bodegas con su rol de planificación' })
  listWarehouses() {
    return this.warehouses.findAll();
  }

  @Post('warehouses/sync')
  @Roles('admin')
  @ApiOperation({ summary: 'Crea una bodega por cada sucursal de BSale que falte; no cambia roles ya asignados' })
  syncWarehouses() {
    return this.warehouses.syncFromBsale();
  }

  @Patch('warehouses/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Cambiar rol, usos o estado de una bodega' })
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(id, dto);
  }

  // ── suppliers ──────────────────────────────────────────────────────────────

  @Get('suppliers')
  @ApiOperation({ summary: 'Proveedores' })
  listSuppliers(@Query('includeInactive') includeInactive?: string) {
    return this.suppliers.findAll(includeInactive === 'true');
  }

  @Post('suppliers')
  @Roles('admin')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Patch('suppliers/:id')
  @Roles('admin')
  updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  // ── planning items ─────────────────────────────────────────────────────────

  @Get('items')
  @ApiOperation({ summary: 'Fichas de abastecimiento por SKU' })
  listItems(@Query() query: QueryPlanningItemsDto) {
    return this.items.findAll(query);
  }

  @Get('items/alerts')
  @ApiOperation({ summary: 'Conteo de fichas incompletas: importados sin proveedor, origen desconocido' })
  itemAlerts() {
    return this.items.alerts();
  }

  @Get('items/:sku')
  getItem(@Param('sku') sku: string) {
    return this.items.findBySku(sku);
  }

  @Get('items/:sku/supply')
  @ApiOperation({ summary: 'Términos de abastecimiento resueltos (con herencia del proveedor)' })
  itemSupply(@Param('sku') sku: string) {
    return this.items.resolveSupply(sku);
  }

  @Patch('items/:sku')
  @Roles('admin', 'supervisor')
  updateItem(@Param('sku') sku: string, @Body() dto: UpdatePlanningItemDto) {
    return this.items.update(sku, dto);
  }

  @Post('items/bulk')
  @Roles('admin')
  @ApiOperation({ summary: 'Crear o actualizar fichas en lote (los campos ausentes no se tocan)' })
  bulkItems(@Body() dto: BulkPlanningItemsDto) {
    return this.items.upsertMany(dto.items);
  }

  @Post('items/sync-catalog')
  @Roles('admin')
  @ApiOperation({ summary: 'Crea una ficha (origen "unknown") para cada SKU con lotes o ventas que no tenga una' })
  syncCatalog() {
    return this.items.syncFromCatalog();
  }

  // ── params ─────────────────────────────────────────────────────────────────

  @Get('params')
  currentParams() {
    return this.params.current();
  }

  @Get('params/history')
  @Roles('admin', 'supervisor')
  paramsHistory() {
    return this.params.history();
  }

  @Patch('params')
  @Roles('admin')
  @ApiOperation({ summary: 'Guarda una nueva versión de parámetros' })
  updateParams(@Body() dto: UpdateParamsDto, @CurrentUser('email') email: string) {
    const { changeNote, ...patch } = dto;
    return this.params.update(patch, email ?? 'unknown', changeNote ?? '');
  }

  // ── sales history ──────────────────────────────────────────────────────────

  @Post('sales-history/load')
  @Roles('admin')
  @ApiOperation({
    summary: 'Encola la carga del historial desde BSale',
    description: 'Sin fechas carga desde 2025-01-01 hasta ayer. Idempotente: vuelve a correr sobre un rango y solo actualiza.',
  })
  async loadHistory(@Body() dto: LoadHistoryDto, @CurrentUser('userId') userId: string) {
    const from = dto.from ?? HISTORY_FLOOR.toISOString().slice(0, 10);
    const to = dto.to ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (from > to) throw new BadRequestException('from debe ser anterior a to');
    const job = await this.historyQueue.add(
      'load',
      { from, to, requestedBy: userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 15000 }, removeOnComplete: 20, removeOnFail: 50 },
    );
    return { jobId: job.id, status: 'queued', from, to };
  }

  @Get('sales-history/jobs/:id')
  async historyJob(@Param('id') id: string) {
    const job = await this.historyQueue.getJob(id);
    if (!job) throw new NotFoundException('Job no encontrado');
    return {
      jobId: job.id, state: await job.getState(), attemptsMade: job.attemptsMade, data: job.data,
      result: job.returnvalue ?? null, failedReason: job.failedReason ?? null,
      queuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
  }

  @Get('sales-history/coverage')
  @ApiOperation({ summary: 'Qué meses cubre el historial cargado' })
  coverage() {
    return this.history.coverage();
  }

  @Get('sales-history/monthly')
  @ApiOperation({ summary: 'Unidades y neto por mes y canal dentro de la ventana' })
  monthly() {
    const w = historyWindow();
    return this.history.monthlyTotals(w.fromMonth, w.toMonth);
  }

  @Get('sales-history/sku/:sku')
  @ApiOperation({ summary: 'Serie mensual de un SKU por canal (componentes de pack incluidos)' })
  skuSeries(@Param('sku') sku: string, @Query('byWarehouse') byWarehouse?: string) {
    const w = historyWindow();
    return this.history.skuSeries(sku, w.fromMonth, w.toMonth, byWarehouse === 'true');
  }

  @Get('sales-history/documents')
  @ApiOperation({ summary: 'Documentos con su canal, para revisión' })
  documents(
    @Query('channel') channel?: Channel,
    @Query('month') month?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.history.documents({ channel, month, search, page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 });
  }

  @Patch('sales-history/documents/:bsaleDocId/channel')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Reclasificar un documento (retail ↔ proyecto). Sin canal vuelve a la regla.' })
  overrideChannel(@Param('bsaleDocId') bsaleDocId: string, @Body() dto: ChannelOverrideDto) {
    return this.history.setChannelOverride(Number(bsaleDocId), dto.channel ?? null, dto.reason ?? '');
  }

  // ── purchase orders (phase 0: create, list, ETA) ──────────────────────────

  @Get('purchase-orders')
  listPurchaseOrders(@Query('status') status?: PoStatus) {
    return this.purchaseOrders.findAll(status);
  }

  @Get('purchase-orders/in-transit')
  @ApiOperation({ summary: 'Pendiente de recibir por SKU, con ETA por línea' })
  async inTransit() {
    const map = await this.purchaseOrders.inTransit();
    return Object.fromEntries(map);
  }

  @Post('purchase-orders')
  @Roles('admin')
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto, @CurrentUser('userId') userId: string) {
    return this.purchaseOrders.create(dto, userId ?? null);
  }

  @Patch('purchase-orders/:id/lines/:sku/eta')
  @Roles('admin', 'supervisor')
  setEta(@Param('id') id: string, @Param('sku') sku: string, @Body() dto: SetEtaDto) {
    return this.purchaseOrders.setLineEta(id, sku, dto.eta ? new Date(dto.eta) : null);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles('admin')
  cancelPurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrders.cancel(id);
  }
}
