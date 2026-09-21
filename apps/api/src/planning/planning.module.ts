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
import { WarehousesService } from './masters/warehouses.service.js';
import { SuppliersService } from './masters/suppliers.service.js';
import { PlanningItemsService } from './masters/planning-items.service.js';
import { PlanningParamsService } from './masters/planning-params.service.js';
import { SalesHistoryService } from './sales-history/sales-history.service.js';
import { SalesHistoryProcessor, SALES_HISTORY_QUEUE } from './sales-history/sales-history.processor.js';
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
      { name: StockLot.name, schema: StockLotSchema },
      { name: PackRecipe.name, schema: PackRecipeSchema },
    ]),
    BullModule.registerQueue({ name: SALES_HISTORY_QUEUE }),
    BsaleModule,
    CountersModule,
    OrdersModule,
    StockModule,
  ],
  controllers: [PlanningController],
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
  ],
  exports: [WarehousesService, SuppliersService, PlanningItemsService, PlanningParamsService, SalesHistoryService, PurchaseOrdersService, PlanningRunsService, StoreReplenishmentService, ProductionService],
})
export class PlanningModule {}
