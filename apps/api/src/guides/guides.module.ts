import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Guide, GuideSchema } from './schemas/guide.schema.js';
import { GuidesService } from './guides.service.js';
import { GuidesController } from './guides.controller.js';
import { BsaleModule } from '../bsale/bsale.module.js';
import { BullModule } from '@nestjs/bullmq';
import { GuideSyncProcessor, GUIDE_SYNC_QUEUE } from './guide-sync.processor.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Guide.name, schema: GuideSchema }]),
    BsaleModule,
    BullModule.registerQueue({ name: GUIDE_SYNC_QUEUE }),
  ],
  controllers: [GuidesController],
  providers: [GuidesService, GuideSyncProcessor],
  // BullModule is exported so OrdersModule can enqueue an emission.
  exports: [GuidesService, BullModule],
})
export class GuidesModule {}
