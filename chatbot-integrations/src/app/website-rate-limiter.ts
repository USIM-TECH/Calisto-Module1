import type { CacheService } from '../cache/index.js'
import { webchatRateLimitKey } from '../cache/cache-keys.js'

export interface WebsiteRateLimiter {
  allow(key: string): Promise<boolean>
}

export function createWebsiteRateLimiter(
  limit: number,
  windowMs: number,
  cache?: CacheService,
): WebsiteRateLimiter {
  if (cache?.backend === 'redis') {
    return createRedisWebsiteRateLimiter(cache, limit, windowMs)
  }
  return createMemoryWebsiteRateLimiter(limit, windowMs)
}

function createMemoryWebsiteRateLimiter(limit: number, windowMs: number): WebsiteRateLimiter {
  const buckets = new Map<string, number[]>()

  return {
    async allow(key: string): Promise<boolean> {
      const now = Date.now()
      const current = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp <= windowMs)
      if (current.length >= limit) {
        buckets.set(key, current)
        return false
      }

      current.push(now)
      buckets.set(key, current)
      return true
    },
  }
}

function createRedisWebsiteRateLimiter(
  cache: CacheService,
  limit: number,
  windowMs: number,
): WebsiteRateLimiter {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000))

  return {
    async allow(key: string): Promise<boolean> {
      const redisKey = webchatRateLimitKey(key)
      const currentRaw = await cache.getString(redisKey)
      const now = Date.now()
      const current = currentRaw
        ? (JSON.parse(currentRaw) as number[]).filter((timestamp) => now - timestamp <= windowMs)
        : []

      if (current.length >= limit) {
        await cache.setString(redisKey, JSON.stringify(current), windowSec)
        return false
      }

      current.push(now)
      await cache.setString(redisKey, JSON.stringify(current), windowSec)
      return true
    },
  }
}
