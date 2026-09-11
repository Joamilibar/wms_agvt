import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from './counter.schema.js';
import { CountersService } from './counters.service.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }])],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
