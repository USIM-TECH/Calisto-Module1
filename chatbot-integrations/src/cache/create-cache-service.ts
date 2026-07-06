import type { AppConfig } from '../config/index.js'
import type { Logger } from '../core/utils/index.js'
import type { CacheService } from './cache-service.js'
import { MemoryCacheService, RedisCacheService } from './memory-cache.js'
import { connectRedis } from './redis-client.js'

export async function createCacheService(config: AppConfig, logger: Logger): Promise<CacheService> {
  const options = { keyPrefix: config.cache.keyPrefix }

  const redis = await connectRedis(config.cache.redisUrl, logger)
  if (redis) {
    return new RedisCacheService(redis, options)
  }

  logger.info('Redis disabled — using in-memory cache fallback')
  return new MemoryCacheService(options)
}

export async function invalidateProductCache(cache: CacheService): Promise<void> {
  await cache.del('products:catalogue:v1')
}

export async function invalidatePresetCache(cache: CacheService): Promise<void> {
  await cache.del('presets:active:v1')
}

export async function invalidateKnowledgeCache(cache: CacheService): Promise<void> {
  await cache.delMany([
    'knowledge:chunks:v1',
    'knowledge:summary:v1',
    'knowledge:documents:v1',
  ])
}

export async function invalidateLeadsCache(cache: CacheService): Promise<void> {
  await cache.del('reports:leads:v1')
}
