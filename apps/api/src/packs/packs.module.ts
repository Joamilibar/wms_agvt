import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackRecipe, PackRecipeSchema } from './schemas/pack-recipe.schema.js';
import { StockLot, StockLotSchema } from '../stock/schemas/stock-lot.schema.js';
import { PacksService } from './packs.service.js';
import { PacksController } from './packs.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackRecipe.name, schema: PackRecipeSchema },
      { name: StockLot.name, schema: StockLotSchema },
    ]),
  ],
  controllers: [PacksController],
  providers: [PacksService],
  exports: [PacksService],
})
export class PacksModule {}
