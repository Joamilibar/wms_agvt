import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { StockLot, StockLotSchema } from '../stock/schemas/stock-lot.schema.js';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import { Guide, GuideSchema } from '../guides/schemas/guide.schema.js';
import { SalesRecord, SalesRecordSchema } from '../analytics/schemas/sales-record.schema.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StockLot.name, schema: StockLotSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Guide.name, schema: GuideSchema },
      { name: SalesRecord.name, schema: SalesRecordSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
