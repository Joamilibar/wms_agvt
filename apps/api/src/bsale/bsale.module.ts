import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BsaleService } from './bsale.service.js';
import { BsaleController } from './bsale.controller.js';
import { StockLot, StockLotSchema } from '../stock/schemas/stock-lot.schema.js';
import { BullModule } from '@nestjs/bullmq';
import { BsaleSyncProcessor, BSALE_SYNC_QUEUE } from './bsale-sync.processor.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockLot.name, schema: StockLotSchema }]),
    BullModule.registerQueue({ name: BSALE_SYNC_QUEUE }),
  ],
  controllers: [BsaleController],
  providers: [BsaleService, BsaleSyncProcessor],
  exports: [BsaleService],
})
export class BsaleModule {}
