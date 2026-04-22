import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { DataSyncLog } from '../data-sync/entities/data-sync-log.entity';

const DATA_VERSION_SCOPE_SEEDS = {
  welfare: ['welfare', 'local-welfare'],
  policy: ['welfare', 'local-welfare', 'youth-policy'],
  youth: ['youth-policy'],
  housing_subscription: [
    'housing-announcement',
    'applyhome',
    'applyhome-cmpet',
    'applyhome-stat',
  ],
  rental_support: ['rental-housing', 'welfare'],
  facility: ['facility'],
  all: [
    'welfare',
    'local-welfare',
    'youth-policy',
    'rental-housing',
    'facility',
    'housing-announcement',
    'applyhome',
    'applyhome-cmpet',
    'applyhome-stat',
  ],
} as const;

export type RagDataVersionScope = keyof typeof DATA_VERSION_SCOPE_SEEDS;

type VersionCacheEntry = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class RagCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RagCacheService.name);
  private readonly redis: Redis;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly versionCache = new Map<RagDataVersionScope, VersionCacheEntry>();
  private hasWarnedAboutRedis = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DataSyncLog)
    private readonly syncLogRepo: Repository<DataSyncLog>,
  ) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

    this.redis.on('error', (error) => {
      this.warnRedisError(error);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => {
      this.redis.disconnect(false);
    });
  }

  async getOrLoad<T>(params: {
    namespace: string;
    keyParts: unknown[];
    ttlSeconds: number;
    dataVersionScope?: RagDataVersionScope;
    loader: () => Promise<T>;
  }): Promise<{ value: T; hit: boolean }> {
    const cacheKey = await this.buildCacheKey(
      params.namespace,
      params.keyParts,
      params.dataVersionScope,
    );
    const cached = await this.readJson<T>(cacheKey);
    if (cached !== null) {
      return { value: cached, hit: true };
    }

    const existing = this.inflight.get(cacheKey) as Promise<T> | undefined;
    if (existing) {
      return { value: await existing, hit: false };
    }

    const loaderPromise = (async () => {
      const value = await params.loader();
      await this.writeJson(cacheKey, value, params.ttlSeconds);
      return value;
    })().finally(() => {
      this.inflight.delete(cacheKey);
    });

    this.inflight.set(cacheKey, loaderPromise);
    return { value: await loaderPromise, hit: false };
  }

  private async buildCacheKey(
    namespace: string,
    keyParts: unknown[],
    dataVersionScope?: RagDataVersionScope,
  ) {
    const version = dataVersionScope
      ? await this.getDataVersion(dataVersionScope)
      : 'static';
    const digest = createHash('sha1')
      .update(JSON.stringify(keyParts))
      .digest('hex');

    return `rag:${namespace}:v:${version}:${digest}`;
  }

  private async getDataVersion(scope: RagDataVersionScope) {
    const cached = this.versionCache.get(scope);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const seedKeys = DATA_VERSION_SCOPE_SEEDS[scope];
    const row = await this.syncLogRepo
      .createQueryBuilder('log')
      .select('MAX(log.finishedAt)', 'latest')
      .where('log.status = :status', { status: 'SUCCESS' })
      .andWhere('log.seedKey IN (:...seedKeys)', { seedKeys })
      .getRawOne<{ latest?: string | null }>();

    const value = row?.latest
      ? new Date(row.latest).getTime().toString(36)
      : 'empty';

    this.versionCache.set(scope, {
      value,
      expiresAt: Date.now() + 30_000,
    });

    return value;
  }

  private async readJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.warnRedisError(error);
      return null;
    }
  }

  private async writeJson<T>(key: string, value: T, ttlSeconds: number) {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warnRedisError(error);
    }
  }

  private warnRedisError(error: unknown) {
    if (this.hasWarnedAboutRedis) return;
    this.hasWarnedAboutRedis = true;
    this.logger.warn(`Redis RAG cache unavailable: ${(error as Error).message}`);
  }
}
