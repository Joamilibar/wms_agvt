import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration.js';
import { CountersModule } from './common/counters/counters.module.js';
import { AppCacheModule } from './common/cache/cache.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { StockModule } from './stock/stock.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { GuidesModule } from './guides/guides.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { BsaleModule } from './bsale/bsale.module.js';
import { SeedModule } from './seed/seed.module.js';
import { PickingLogModule } from './picking-log/picking-log.module.js';
import { PacksModule } from './packs/packs.module.js';
import { PlanningModule } from './planning/planning.module.js';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // ConfigModule solo mira el .env del directorio de trabajo, que al correr
      // `npm run start:dev` es apps/api. El .env de la raiz —el que usa docker
      // compose— quedaba ignorado en silencio: mismas claves, valores distintos.
      // Se leen ambos, el local primero.
      envFilePath: ['.env', '../../.env'],
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

    // Shared
    CountersModule,
    AppCacheModule,

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
    PacksModule,
    PlanningModule,
  ],
  providers: [
    // Without this the ThrottlerModule config above is inert and every
    // @Throttle() decorator (including the one on /auth/login) does nothing.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
