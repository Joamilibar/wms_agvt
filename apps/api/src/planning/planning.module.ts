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
import { WarehousesService } from './masters/warehouses.service.js';
import { SuppliersService } from './masters/suppliers.service.js';
import { PlanningItemsService } from './masters/planning-items.service.js';
import { PlanningParamsService } from './masters/planning-params.service.js';
import { SalesHistoryService } from './sales-history/sales-history.service.js';
import { SalesHistoryProcessor, SALES_HISTORY_QUEUE } from './sales-history/sales-history.processor.js';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service.js';
import { PlanningController } from './planning.controller.js';

/**
 * Purchasing, production and store replenishment share one demand engine.
 * Phase 0 (this module as it stands) holds the masters, the parameters and
 * the sales history the engine will read; the engine itself is phase 1.
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
      { name: StockLot.name, schema: StockLotSchema },
      { name: PackRecipe.name, schema: PackRecipeSchema },
    ]),
    BullModule.registerQueue({ name: SALES_HISTORY_QUEUE }),
    BsaleModule,
    CountersModule,
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
  ],
  exports: [WarehousesService, SuppliersService, PlanningItemsService, PlanningParamsService, SalesHistoryService, PurchaseOrdersService],
})
export class PlanningModule {}
