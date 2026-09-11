import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema.js';
import { SalesRecord, SalesRecordSchema } from '../analytics/schemas/sales-record.schema.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { StockModule } from '../stock/stock.module.js';
import { BsaleModule } from '../bsale/bsale.module.js';
import { PickingLogModule } from '../picking-log/picking-log.module.js';
import { GuidesModule } from '../guides/guides.module.js';
import { BullModule } from '@nestjs/bullmq';
import { GUIDE_SYNC_QUEUE } from '../guides/guide-sync.processor.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      // A-08: processFIFO writes a SalesRecord per consumed line.
      { name: SalesRecord.name, schema: SalesRecordSchema },
    ]),
    StockModule,
    BsaleModule,
    PickingLogModule,
    GuidesModule,
    BullModule.registerQueue({ name: GUIDE_SYNC_QUEUE }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
