import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockLot, StockLotSchema } from './schemas/stock-lot.schema.js';
import { StockService } from './stock.service.js';
import { StockController } from './stock.controller.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: StockLot.name, schema: StockLotSchema }])],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
