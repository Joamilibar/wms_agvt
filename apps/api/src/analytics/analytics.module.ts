import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SalesRecord, SalesRecordSchema } from './schemas/sales-record.schema.js';
import { StockLot, StockLotSchema } from '../stock/schemas/stock-lot.schema.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SalesRecord.name, schema: SalesRecordSchema },
      { name: StockLot.name, schema: StockLotSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
