import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PickingLog, PickingLogSchema } from './schemas/picking-log.schema.js';
import { PickingLogController } from './picking-log.controller.js';
import { PickingLogService } from './picking-log.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PickingLog.name, schema: PickingLogSchema }]),
  ],
  controllers: [PickingLogController],
  providers: [PickingLogService],
  exports: [PickingLogService],
})
export class PickingLogModule { }
