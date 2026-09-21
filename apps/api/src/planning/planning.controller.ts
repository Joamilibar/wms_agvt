import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, NotFoundException, BadRequestException, Res, Header,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { UpdateWarehouseDto, UpdateParamsDto, ChannelOverrideDto, LoadHistoryDto, SetEtaDto, RunDto } from './dto/misc.dto.js';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto, UpdateDraftPurchaseOrderDto, CreateOrderFromRunDto } from './dto/purchase-order.dto.js';
import { PlanningRunsService } from './engine/planning-runs.service.js';
import { StoreReplenishmentService } from './store/store-replenishment.service.js';
import { BulkIdealsDto, CreateTransferDto, UpdateTransferDto } from './dto/store.dto.js';
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
    private runs: PlanningRunsService,
    private store: StoreReplenishmentService,
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

  // ── planning runs ──────────────────────────────────────────────────────────

  @Post('runs')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Ejecuta el motor y guarda la corrida completa (foto de stock, tránsito y parámetros)' })
  async createRun(@Body() dto: RunDto, @CurrentUser('userId') userId: string) {
    const run = await this.runs.run(userId ?? null, dto.notes ?? '');
    const { results: _r, ...header } = run.toObject();
    void _r;
    return header;
  }

  @Get('runs')
  listRuns() {
    return this.runs.list();
  }

  @Get('runs/latest')
  async latestRun() {
    const run = await this.runs.latest();
    if (!run) return null;
    const { results: _r, ...header } = run.toObject();
    void _r;
    return header;
  }

  @Get('runs/:id/results')
  @ApiOperation({ summary: 'Resultados de una corrida, filtrables; ordenados por urgencia' })
  runResults(
    @Param('id') id: string,
    @Query('state') state?: string, @Query('origin') origin?: string, @Query('supplierId') supplierId?: string,
    @Query('abc') abc?: string, @Query('search') search?: string, @Query('onlySuggested') onlySuggested?: string,
  ) {
    return this.runs.results(id, { state, origin, supplierId, abc, search, onlySuggested: onlySuggested === 'true' });
  }

  @Get('runs/:id/proposal')
  @ApiOperation({ summary: 'Propuesta de compra de la corrida agrupada por proveedor' })
  runProposal(@Param('id') id: string) {
    return this.runs.proposal(id);
  }

  @Get('runs/:id/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV con las columnas de Datos_PowerBI y las nuevas' })
  async exportRun(@Param('id') id: string, @Res() res: Response) {
    const run = await this.runs.findById(id);
    res.setHeader('Content-Disposition', `attachment; filename="${run.number}.csv"`);
    res.send(await this.runs.exportCsv(id));
  }

  @Post('runs/:id/approve')
  @Roles('admin')
  approveRun(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.runs.approve(id, userId ?? null);
  }

  @Post('runs/:id/purchase-orders')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Crea una OC en borrador con la propuesta de un proveedor; las cantidades cambiadas llevan motivo' })
  orderFromRun(@Param('id') id: string, @Body() dto: CreateOrderFromRunDto, @CurrentUser('userId') userId: string) {
    return this.runs.createPurchaseOrder(id, dto.supplierId ?? null, dto.overrides ?? [], userId ?? null);
  }

  // ── store replenishment (phase 2) ──────────────────────────────────────────

  @Get('store/stores')
  @ApiOperation({ summary: 'Tiendas activas y la bodega que las abastece' })
  stores() {
    return this.store.stores();
  }

  @Get('store/plan')
  @ApiOperation({ summary: 'Plan de reposición de una tienda, calculado en vivo' })
  storePlan(@Query('store') store: string) {
    if (!store) throw new BadRequestException('store es obligatorio');
    return this.store.plan(store);
  }

  @Get('store/ideals')
  storeIdeals(@Query('store') store: string) {
    if (!store) throw new BadRequestException('store es obligatorio');
    return this.store.listIdeals(store);
  }

  @Post('store/ideals')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Crear, cambiar o borrar ideales manuales (ideal null = volver al calculado)' })
  upsertIdeals(@Query('store') store: string, @Body() dto: BulkIdealsDto, @CurrentUser('email') email: string) {
    if (!store) throw new BadRequestException('store es obligatorio');
    return this.store.upsertIdeals(store, dto.rows, email ?? 'unknown');
  }

  @Get('store/transfers')
  transfers(@Query('store') store?: string) {
    return this.store.listTransfers(store || undefined);
  }

  @Post('store/transfers')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Congela el envío (o retiro) del plan en una transferencia en borrador' })
  createTransfer(@Query('store') store: string, @Body() dto: CreateTransferDto, @CurrentUser('userId') userId: string) {
    if (!store) throw new BadRequestException('store es obligatorio');
    return this.store.createFromPlan(store, dto.direction, dto.overrides ?? [], userId ?? null);
  }

  @Patch('store/transfers/:id')
  @Roles('admin', 'supervisor')
  updateTransfer(@Param('id') id: string, @Body() dto: UpdateTransferDto) {
    return this.store.updateDraft(id, dto.lines);
  }

  @Post('store/transfers/:id/approve')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Aprueba y crea la orden de picking en el origen (reserva FIFO)' })
  approveTransfer(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.store.approve(id, userId);
  }

  @Post('store/transfers/:id/deliver')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Marca entregada: crea los lotes en el destino con lo que el picking tomó' })
  deliverTransfer(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.store.deliver(id, userId ?? null);
  }

  @Post('store/transfers/:id/cancel')
  @Roles('admin', 'supervisor')
  cancelTransfer(@Param('id') id: string) {
    return this.store.cancel(id);
  }

  // ── purchase orders ────────────────────────────────────────────────────────

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

  @Patch('purchase-orders/:id')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Editar una orden en borrador' })
  updateDraft(@Param('id') id: string, @Body() dto: UpdateDraftPurchaseOrderDto) {
    return this.purchaseOrders.updateDraft(id, dto);
  }

  @Post('purchase-orders/:id/approve')
  @Roles('admin')
  approvePurchaseOrder(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.purchaseOrders.approve(id, userId ?? null);
  }

  @Post('purchase-orders/:id/send')
  @Roles('admin', 'supervisor')
  sendPurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrders.markSent(id);
  }

  @Post('purchase-orders/:id/receive')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Recibe líneas (total o parcial) y crea los lotes con fecha real y costo desembarcado' })
  receivePurchaseOrder(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto, @CurrentUser('userId') userId: string) {
    return this.purchaseOrders.receive(id, dto, userId ?? null);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles('admin')
  cancelPurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrders.cancel(id);
  }
}
