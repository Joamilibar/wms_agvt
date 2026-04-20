import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { StockModule } from './stock/stock.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { GuidesModule } from './guides/guides.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { BsaleModule } from './bsale/bsale.module.js';
import { SeedModule } from './seed/seed.module.js';
import { PickingLogModule } from './picking-log/picking-log.module.js';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
      inject: [ConfigService],
    }),

    // Redis + BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60000,
      limit: 100,
    }]),

    // Feature modules
    AuthModule,
    UsersModule,
    StockModule,
    OrdersModule,
    GuidesModule,
    AnalyticsModule,
    BsaleModule,
    SeedModule,
    PickingLogModule,
  ],
})
export class AppModule {}
