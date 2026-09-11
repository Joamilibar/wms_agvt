import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * A thin read-through cache over the Redis instance the stack already runs.
 *
 * M-04: Redis was up in the compose file and the API never touched it, while
 * the dashboard recomputed aging and coverage from scratch on every visit.
 *
 * Every method degrades to a direct call if Redis is unreachable — analytics
 * going stale is a problem, analytics going down is a worse one.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;
  private healthy = true;

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) => {
      if (this.healthy) {
        this.healthy = false;
        this.logger.warn(`Redis cache unavailable, serving uncached: ${err.message}`);
      }
    });
    this.client.on('ready', () => {
      this.healthy = true;
      this.logger.log('Redis cache connected');
    });

    this.client.connect().catch(() => {
      /* the error handler above already reported it */
    });
  }

  /** Returns the cached value for `key`, or computes, stores and returns it. */
  async wrap<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
    if (!this.healthy) return produce();

    try {
      const hit = await this.client.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      return produce();
    }

    const value = await produce();

    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* a cache that cannot store is still a cache that can serve */
    }

    return value;
  }

  /** Drops every key under a prefix. Called when a picking changes the numbers. */
  async invalidate(prefix: string): Promise<number> {
    if (!this.healthy) return 0;

    let removed = 0;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          removed += await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err: any) {
      this.logger.warn(`Cache invalidation for ${prefix} failed: ${err.message}`);
    }

    return removed;
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
