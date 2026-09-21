import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { BsaleModule } from '../bsale/bsale.module.js';
import { CountersModule } from '../common/counters/counters.module.js';
import { StockLot, StockLotSchema } from '../stock/schemas/stock-lot.schema.js';
import { PackRecipe, PackRecipeSchema } from '../packs/schemas/pack-recipe.schema.js';
import { Warehouse, WarehouseSchema } from './schemas/warehouse.schema.js';
import { Supplier, SupplierSchema } from './schemas/supplier.schema.js';
import { PlanningItem, PlanningItemSchema } from './schemas/planning-item.schema.js';
import { SalesHistory, SalesHistorySchema } from './schemas/sales-history.schema.js';
import { PlanningParams, PlanningParamsSchema } from './schemas/planning-params.schema.js';
import { PurchaseOrder, PurchaseOrderSchema } from './schemas/purchase-order.schema.js';
import { PlanningRun, PlanningRunSchema } from './schemas/planning-run.schema.js';
import { IdealStock, IdealStockSchema } from './schemas/ideal-stock.schema.js';
import { TransferOrder, TransferOrderSchema } from './schemas/transfer-order.schema.js';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import { OrdersModule } from '../orders/orders.module.js';
import { StockModule } from '../stock/stock.module.js';
import { BomRecipe, BomRecipeSchema } from './schemas/bom-recipe.schema.js';
import { ProductionOrder, ProductionOrderSchema } from './schemas/production-order.schema.js';
import { DemandEvent, DemandEventSchema, ProjectDemand, ProjectDemandSchema, ForecastAccuracy, ForecastAccuracySchema } from './schemas/phase4.schemas.js';
import { DemandEventsService } from './phase4/events.service.js';
import { ForecastAccuracyService } from './phase4/accuracy.service.js';
import { ProjectsService } from './phase4/projects.service.js';
import { KpisService } from './phase4/kpis.service.js';
import { PlanningScheduler } from './phase4/scheduler.service.js';
import { FabricSpec, FabricSpecSchema } from './schemas/fabric-spec.schema.js';
import { SheetingModel, SheetingModelSchema } from './schemas/sheeting-model.schema.js';
import { SheetingMastersService } from './sheeting/sheeting-masters.service.js';
import { SheetingCalcService } from './sheeting/sheeting-calc.service.js';
import { WorkshopRatesService } from './sheeting/workshop-rates.service.js';
import { SheetingRecipesService } from './sheeting/sheeting-recipes.service.js';
import { SheetingQuote, SheetingQuoteSchema } from './schemas/sheeting-quote.schema.js';
import { WorkshopRate, WorkshopRateSchema } from './schemas/workshop-rate.schema.js';
import { SheetingController } from './sheeting/sheeting.controller.js';
import { WarehousesService } from './masters/warehouses.service.js';
import { SuppliersService } from './masters/suppliers.service.js';
import { PlanningItemsService } from './masters/planning-items.service.js';
import { PlanningParamsService } from './masters/planning-params.service.js';
import { SalesHistoryService } from './sales-history/sales-history.service.js';
import { SalesHistoryProcessor, SALES_HISTORY_QUEUE } from './sales-history/sales-history.processor.js';
import { BSALE_SYNC_QUEUE } from '../bsale/bsale-sync.processor.js';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service.js';
import { PlanningRunsService } from './engine/planning-runs.service.js';
import { StoreReplenishmentService } from './store/store-replenishment.service.js';
import { ProductionService } from './production/production.service.js';
import { PlanningController } from './planning.controller.js';

/**
 * Purchasing, production and store replenishment share one demand engine.
 * Phase 0 holds the masters, the parameters and the sales history; phase 1
 * adds the engine (`engine/`), the saved runs and the purchase-order cycle;
 * phase 2 the store replenishment (`store/`) on top of the WMS picking;
 * phase 3 recipes, the material explosion and production orders (`production/`).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: PlanningItem.name, schema: PlanningItemSchema },
      { name: SalesHistory.name, schema: SalesHistorySchema },
      { name: PlanningParams.name, schema: PlanningParamsSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: PlanningRun.name, schema: PlanningRunSchema },
      { name: IdealStock.name, schema: IdealStockSchema },
      { name: TransferOrder.name, schema: TransferOrderSchema },
      { name: Order.name, schema: OrderSchema },
      { name: BomRecipe.name, schema: BomRecipeSchema },
      { name: ProductionOrder.name, schema: ProductionOrderSchema },
      { name: DemandEvent.name, schema: DemandEventSchema },
      { name: ProjectDemand.name, schema: ProjectDemandSchema },
      { name: ForecastAccuracy.name, schema: ForecastAccuracySchema },
      { name: FabricSpec.name, schema: FabricSpecSchema },
      { name: SheetingModel.name, schema: SheetingModelSchema },
      { name: WorkshopRate.name, schema: WorkshopRateSchema },
      { name: SheetingQuote.name, schema: SheetingQuoteSchema },
      { name: StockLot.name, schema: StockLotSchema },
      { name: PackRecipe.name, schema: PackRecipeSchema },
    ]),
    BullModule.registerQueue({ name: SALES_HISTORY_QUEUE }, { name: BSALE_SYNC_QUEUE }),
    BsaleModule,
    CountersModule,
    OrdersModule,
    StockModule,
  ],
  controllers: [PlanningController, SheetingController],
  providers: [
    WarehousesService,
    SuppliersService,
    PlanningItemsService,
    PlanningParamsService,
    SalesHistoryService,
    SalesHistoryProcessor,
    PurchaseOrdersService,
    PlanningRunsService,
    StoreReplenishmentService,
    ProductionService,
    DemandEventsService,
    ForecastAccuracyService,
    ProjectsService,
    KpisService,
    PlanningScheduler,
    SheetingMastersService,
    SheetingCalcService,
    WorkshopRatesService,
    SheetingRecipesService,
  ],
  exports: [WarehousesService, SuppliersService, PlanningItemsService, PlanningParamsService, SalesHistoryService, PurchaseOrdersService, PlanningRunsService, StoreReplenishmentService, ProductionService, DemandEventsService, ForecastAccuracyService, ProjectsService, KpisService],
})
export class PlanningModule {}
