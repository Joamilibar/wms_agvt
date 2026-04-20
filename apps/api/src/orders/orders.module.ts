import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { StockModule } from '../stock/stock.module.js';
import { BsaleModule } from '../bsale/bsale.module.js';
import { PickingLogModule } from '../picking-log/picking-log.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    StockModule,
    BsaleModule,
    PickingLogModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
