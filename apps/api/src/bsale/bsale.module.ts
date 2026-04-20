import { Module } from '@nestjs/common';
import { BsaleService } from './bsale.service.js';
import { BsaleController } from './bsale.controller.js';

@Module({
  controllers: [BsaleController],
  providers: [BsaleService],
  exports: [BsaleService],
})
export class BsaleModule {}
