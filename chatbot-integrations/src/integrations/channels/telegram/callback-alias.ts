import { createHash } from 'node:crypto'


const MAX_CALLBACK_BYTES = 64
const ALIAS_PREFIX = 'cb:'

export class TelegramCallbackAliasStore {
  private readonly _map: Map<string, string>
  private readonly _maxEntries: number

  constructor(maxEntries = 1000) {
    this._map = new Map()
    this._maxEntries = Math.max(1, maxEntries)
  }

  public alias(payload: string): string {
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

  public resolve(value: string): string {
    if (!value.startsWith(ALIAS_PREFIX)) {
      return value
    }
    return this._map.get(value) ?? value
  }
}
