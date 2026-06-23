import { Redis } from 'ioredis'
import type { CacheService, CacheServiceOptions } from './cache-service.js'
import { prefixKey } from './cache-service.js'

interface MemoryEntry {
  value: string
  expiresAt: number
}

export class MemoryCacheService implements CacheService {
  readonly backend = 'memory' as const
  private readonly _entries = new Map<string, MemoryEntry>()
  private readonly _prefix: string

  constructor(options: CacheServiceOptions) {
    this._prefix = options.keyPrefix
  }

  private _fullKey(key: string): string {
    return prefixKey(this._prefix, key)
  }

  private _read(key: string): string | undefined {
    const entry = this._entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this._entries.delete(key)
      return undefined
    }
    return entry.value
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const raw = this._read(this._fullKey(key))
    if (raw === undefined) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    await this.setString(this._fullKey(key), JSON.stringify(value), ttlSec)
  }

  async getString(key: string): Promise<string | undefined> {
    return this._read(this._fullKey(key))
  }

  async setString(key: string, value: string, ttlSec: number): Promise<void> {
    const fullKey = key.startsWith(`${this._prefix}:`) ? key : this._fullKey(key)
    this._entries.set(fullKey, {
      value,
      expiresAt: Date.now() + ttlSec * 1000,
    })
  }

  async del(key: string): Promise<void> {
    this._entries.delete(this._fullKey(key))
  }

  async delMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.del(key)))
  }

  async ping(): Promise<boolean> {
    return true
  }
}

export class RedisCacheService implements CacheService {
  readonly backend = 'redis' as const
  private readonly _prefix: string

  constructor(
    private readonly _client: Redis,
    options: CacheServiceOptions,
  ) {
    this._prefix = options.keyPrefix
  }

  private _fullKey(key: string): string {
    return prefixKey(this._prefix, key)
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const raw = await this._client.get(this._fullKey(key))
    if (raw === null) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    await this._client.set(this._fullKey(key), JSON.stringify(value), 'EX', ttlSec)
  }

  async getString(key: string): Promise<string | undefined> {
    const raw = await this._client.get(this._fullKey(key))
    return raw === null ? undefined : raw
  }

  async setString(key: string, value: string, ttlSec: number): Promise<void> {
    const fullKey = key.startsWith(`${this._prefix}:`) ? key : this._fullKey(key)
    await this._client.set(fullKey, value, 'EX', ttlSec)
  }

  async del(key: string): Promise<void> {
    await this._client.del(this._fullKey(key))
  }

  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await this._client.del(...keys.map((key) => this._fullKey(key)))
  }

  async ping(): Promise<boolean> {
    const result = await this._client.ping()
    return result === 'PONG'
  }
}
