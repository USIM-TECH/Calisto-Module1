import { Redis } from 'ioredis'
import type { Logger } from '../core/utils/index.js'

let client: Redis | undefined
let connected = false

export function getRedisClient(redisUrl?: string): Redis | undefined {
  if (!redisUrl) return undefined
  if (!client) {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    })
  }
  return client
}

export async function connectRedis(redisUrl: string | undefined, logger: Logger): Promise<Redis | undefined> {
  const redis = getRedisClient(redisUrl)
  if (!redis) return undefined

  if (connected) return redis

  try {
    await redis.connect()
    connected = true
    logger.info(`Redis connected (${redisUrl})`)
    return redis
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Redis unavailable (${message}) — using in-memory cache fallback`)
    try {
      redis.disconnect()
    } catch {
      // ignore
    }
    client = undefined
    connected = false
    return undefined
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return
  try {
    await client.quit()
  } catch {
    client.disconnect()
  } finally {
    client = undefined
    connected = false
  }
}

export function isRedisConnected(): boolean {
  return connected
}
