import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BsaleService } from './bsale.service.js';
import { BsaleController } from './bsale.controller.js';
import { StockLot, StockLotSchema } from '../stock/schemas/stock-lot.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockLot.name, schema: StockLotSchema }]),
  ],
  controllers: [BsaleController],
  providers: [BsaleService],
  exports: [BsaleService],
})
export class BsaleModule {}
