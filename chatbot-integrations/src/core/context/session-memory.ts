import type { CacheService } from '../../cache/cache-service.js'
import type { SessionContext } from './context-types.js'

/**
 * Session Memory Manager - Handles Redis storage of user context
 */

const SESSION_TTL_SEC = 1800 // 30 minutes

export class SessionMemoryManager {
  private readonly _cache: CacheService

  constructor(cache: CacheService) {
    this._cache = cache
  }

  /**
   * Get session context from Redis
   */
  public async getContext(sessionId: string): Promise<SessionContext | null> {
    const key = this._buildKey(sessionId)
    const data = await this._cache.getJson<SessionContext>(key)
    return data || null
  }

  /**
   * Update session context in Redis
   */
  public async updateContext(
    sessionId: string,
    interest: Partial<SessionContext['current_interest']>,
    query: string,
  ): Promise<void> {
    const existing = await this.getContext(sessionId)
    
    const context: SessionContext = {
      session_id: sessionId,
      current_interest: {
        ...existing?.current_interest,
        ...interest,
      },
      last_query: query,
      updated_at: new Date().toISOString(),
    }

    const key = this._buildKey(sessionId)
    await this._cache.setJson(key, context, SESSION_TTL_SEC)
  }

  /**
   * Clear session context
   */
  public async clearContext(sessionId: string): Promise<void> {
    const key = this._buildKey(sessionId)
    await this._cache.del(key)
  }

  private _buildKey(sessionId: string): string {
    return `session:context:${sessionId}`
  }
}
