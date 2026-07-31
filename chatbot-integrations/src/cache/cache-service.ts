export interface CacheService {
  readonly backend: 'redis' | 'memory'
  getJson<T>(key: string): Promise<T | undefined>
  setJson(key: string, value: unknown, ttlSec: number): Promise<void>
  getString(key: string): Promise<string | undefined>
  setString(key: string, value: string, ttlSec: number): Promise<void>
  del(key: string): Promise<void>
  delMany(keys: string[]): Promise<void>
  ping(): Promise<boolean>
}

export interface CacheServiceOptions {
  keyPrefix: string
}

export function prefixKey(prefix: string, key: string): string {
  return `${prefix}:${key}`
}
