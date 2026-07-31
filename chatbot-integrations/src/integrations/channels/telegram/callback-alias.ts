import { createHash } from 'node:crypto'
import { telegramCallbackKey, type CacheService } from '../../../cache/index.js'

const MAX_CALLBACK_BYTES = 64
export const ALIAS_PREFIX = 'cb:'

export interface CallbackAliasStore {
  alias(payload: string): Promise<string>
  resolve(value: string): Promise<string>
}

export class TelegramCallbackAliasStore implements CallbackAliasStore {
  private readonly _map: Map<string, string>
  private readonly _maxEntries: number

  constructor(maxEntries = 1000) {
    this._map = new Map()
    this._maxEntries = Math.max(1, maxEntries)
  }

  async alias(payload: string): Promise<string> {
    if (Buffer.byteLength(payload, 'utf8') <= MAX_CALLBACK_BYTES) {
      return payload
    }

    const digest = createHash('sha1').update(payload).digest('hex').slice(0, 24)
    const token = `${ALIAS_PREFIX}${digest}`

    const existing = this._map.get(token)
    if (existing !== undefined) {
      this._map.delete(token)
      this._map.set(token, payload)
      return token
    }

    if (this._map.size >= this._maxEntries) {
      const oldest = this._map.keys().next().value
      if (oldest !== undefined) {
        this._map.delete(oldest)
      }
    }
    this._map.set(token, payload)
    return token
  }

  async resolve(value: string): Promise<string> {
    if (!value.startsWith(ALIAS_PREFIX)) {
      return value
    }
    return this._map.get(value) ?? value
  }
}

export class RedisCallbackAliasStore implements CallbackAliasStore {
  constructor(
    private readonly _cache: CacheService,
    private readonly _ttlSec: number,
  ) {}

  async alias(payload: string): Promise<string> {
    if (Buffer.byteLength(payload, 'utf8') <= MAX_CALLBACK_BYTES) {
      return payload
    }

    const digest = createHash('sha1').update(payload).digest('hex').slice(0, 24)
    const token = `${ALIAS_PREFIX}${digest}`
    await this._cache.setString(telegramCallbackKey(token), payload, this._ttlSec)
    return token
  }

  async resolve(value: string): Promise<string> {
    if (!value.startsWith(ALIAS_PREFIX)) {
      return value
    }
    const payload = await this._cache.getString(telegramCallbackKey(value))
    return payload ?? value
  }
}

export function createCallbackAliasStore(
  cache: CacheService,
  ttlSec: number,
): CallbackAliasStore {
  if (cache.backend === 'redis') {
    return new RedisCallbackAliasStore(cache, ttlSec)
  }
  return new TelegramCallbackAliasStore()
}
