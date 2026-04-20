import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Guide, GuideSchema } from './schemas/guide.schema.js';
import { GuidesService } from './guides.service.js';
import { GuidesController } from './guides.controller.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Guide.name, schema: GuideSchema }])],
  controllers: [GuidesController],
  providers: [GuidesService],
  exports: [GuidesService],
})
export class GuidesModule {}
