import axios from 'axios'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CACHE_KEYS, type CacheService } from '../../../cache/index.js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeInstagramMessagingItem } from './incoming.js'
import { sendInstagramMessage } from './outgoing.js'
import { handleInstagramWebhook } from './webhook.js'
import type { InstagramRecipientId } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Persist the refreshed token to a sidecar JSON file.
 * We deliberately do NOT write to .env here because tsx watch monitors .env
 * and would restart the server on every write, creating a refresh loop.
 * The cache file is loaded by the token bootstrap helper below.
 */
const TOKEN_CACHE_PATH = path.resolve(__dirname, '..', '..', '..', '..', '.instagram-token-cache.json')

function tokenCachePath(accountId?: string): string {
  if (!accountId) return TOKEN_CACHE_PATH
  return path.resolve(__dirname, '..', '..', '..', '..', `.instagram-token-cache.${accountId}.json`)
}

function saveTokenCache(token: string, expiresAt: number, accountId?: string): void {
  try {
    fs.writeFileSync(tokenCachePath(accountId), JSON.stringify({ token, expiresAt }), 'utf8')
  } catch {
    // Non-fatal — the in-memory token is already updated
  }
}

async function saveTokenToCache(
  cache: CacheService | undefined,
  token: string,
  expiresAt: number,
  accountId?: string,
): Promise<void> {
  saveTokenCache(token, expiresAt, accountId)
  if (!cache) return
  const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000) - 3600)
  await cache.setJson(CACHE_KEYS.instagramToken(accountId), { token, expiresAt }, ttlSec)
}

async function loadTokenFromCache(cache: CacheService | undefined, accountId?: string): Promise<{ token: string; expiresAt: number } | null> {
  if (cache) {
    const data = await cache.getJson<{ token: string; expiresAt: number }>(CACHE_KEYS.instagramToken(accountId))
    if (data && typeof data.token === 'string' && typeof data.expiresAt === 'number' && data.expiresAt > Date.now()) {
      return data
    }
  }
  return loadCachedInstagramToken(accountId)
}

/** Load a previously cached token if it has not expired yet. */
export function loadCachedInstagramToken(accountId?: string): { token: string; expiresAt: number } | null {
  try {
    const raw = fs.readFileSync(tokenCachePath(accountId), 'utf8')
    const data = JSON.parse(raw) as { token: string; expiresAt: number }
    if (typeof data.token === 'string' && typeof data.expiresAt === 'number' && data.expiresAt > Date.now()) {
      return data
    }
  } catch {
    // Cache absent or corrupt — fall back to env token
  }
  return null
}

export interface InstagramConfig {
  accessToken: string
  instagramId: string
  verifyToken: string
  clientId: string
  clientSecret?: string
  apiVersion?: string
  accountId?: string
  onTokenRefreshed?: (accessToken: string, expiresAt: Date) => Promise<void>
}

/**
 * Refresh interval: 20 days.
 * Must stay below JavaScript's MAX_INT32 (~24.8 days = 2,147,483,647 ms).
 * setInterval with a value above that threshold overflows to ~0 and fires immediately.
 */
const TOKEN_REFRESH_INTERVAL_MS = 20 * 24 * 60 * 60 * 1000 // 1,728,000,000 ms — safely within int32

export class InstagramChannel {
  private _config: InstagramConfig
  private _logger: Logger
  private _instagramApiUrl: string
  private _cacheService?: CacheService
  private _onMessage?: (message: IncomingMessage) => Promise<void>
  private _tokenRefreshTimer?: ReturnType<typeof setTimeout>

  constructor(config: InstagramConfig, logger: Logger, cacheService?: CacheService) {
    this._config = config
    this._logger = logger
    this._cacheService = cacheService
    const version = config.apiVersion ?? 'v21.0'
    this._instagramApiUrl = `https://graph.instagram.com/${version}`
    void this._bootstrapAccessToken()
    this._startTokenAutoRefresh()
  }

  private async _bootstrapAccessToken(): Promise<void> {
    const cached = await loadTokenFromCache(this._cacheService, this._config.accountId)
    if (cached) {
      this._config.accessToken = cached.token
      this._logger.info(`[Instagram${this._config.accountId ? `:${this._config.accountId}` : ''}] Loaded cached access token`)
    }
  }

  /**
   * Schedule a one-shot refresh using recursive setTimeout.
   * Using setInterval with 30 days (2,592,000,000 ms) overflows JS's internal
   * int32 timer and fires immediately — hence the loop. Recursive setTimeout
   * re-arms after each successful or failed attempt and has no int32 limit.
   */
  private _startTokenAutoRefresh(): void {
    const schedule = () => {
      this._tokenRefreshTimer = setTimeout(async () => {
        try {
          this._logger.info('[Instagram] Proactively refreshing access token…')
          const { accessToken, expirationTime } = await this.refreshAccessToken()
          this._config.accessToken = accessToken
          const expiresAt = new Date(expirationTime)
          await saveTokenToCache(this._cacheService, accessToken, expirationTime, this._config.accountId)
          if (this._config.onTokenRefreshed) {
            await this._config.onTokenRefreshed(accessToken, expiresAt)
          }
          const expiryDate = expiresAt.toISOString()
          this._logger.info(`[Instagram] Access token refreshed — new expiry: ${expiryDate}`)
        } catch (err: any) {
          this._logger.error(`[Instagram] Failed to auto-refresh access token: ${err?.message ?? err}`)
        } finally {
          // Re-arm regardless of success/failure
          schedule()
        }
      }, TOKEN_REFRESH_INTERVAL_MS)

      // Don't keep the Node.js event loop alive solely for this timer
      this._tokenRefreshTimer.unref()
    }

    schedule()
  }

  /** Stop the background token refresh (useful in tests or on shutdown). */
  public stopTokenAutoRefresh(): void {
    if (this._tokenRefreshTimer) {
      clearTimeout(this._tokenRefreshTimer)
      this._tokenRefreshTimer = undefined
    }
  }


  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  public async sendTextMessage(recipientId: string, text: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'text', text })) ?? ''
  }

  public async sendImageMessage(recipientId: string, imageUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'image', imageUrl })) ?? ''
  }

  public async sendAudioMessage(recipientId: string, audioUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'audio', audioUrl })) ?? ''
  }

  public async sendVideoMessage(recipientId: string, videoUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'video', videoUrl })) ?? ''
  }

  public async sendFileMessage(recipientId: string, fileUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'file', fileUrl })) ?? ''
  }


  public async sendLocationMessage(recipientId: string, latitude: number, longitude: number): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'location', latitude, longitude })) ?? ''
  }


  public async replyToComment(commentId: string, text: string): Promise<string> {
    const fields = new URLSearchParams({ message: text, access_token: this._config.accessToken })
    const url = `${this._instagramApiUrl}/${commentId}/replies?${fields.toString()}`
    const response = await axios.post<{ id: string }>(url, {})
    const { id } = z.object({ id: z.string() }).parse(response.data)
    return id
  }

  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    return sendInstagramMessage(recipientId, message, this._logger, async (recipient, rawMessage) => {
      return this._sendMessage(recipient, rawMessage)
    })
  }

  public async getUserProfile(instagramUserId: string): Promise<{ id: string; name: string; username: string }> {
    const query = new URLSearchParams({
      access_token: this._config.accessToken,
      fields: 'id,name,username',
    })
    const url = `${this._instagramApiUrl}/${instagramUserId}?${query.toString()}`
    const response = await axios.get(url)
    return response.data
  }

  public async getAccessTokenFromCode(code: string, redirectUri: string): Promise<{ accessToken: string; expirationTime: number }> {
    const formData = {
      client_id: this._config.clientId,
      client_secret: this._config.clientSecret ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }
    const queryString = new URLSearchParams(formData)
    let res = await axios.post('https://api.instagram.com/oauth/access_token', queryString.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const shortLivedTokenData = z.object({ access_token: z.string() }).parse(res.data)

    const query = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: this._config.clientSecret ?? '',
      access_token: shortLivedTokenData.access_token,
    })
    res = await axios.get(`${this._instagramApiUrl}/access_token?${query.toString()}`)
    const { access_token, expires_in } = z.object({ access_token: z.string(), expires_in: z.number() }).parse(res.data)

    return { accessToken: access_token, expirationTime: Date.now() + expires_in * 1000 }
  }

  public async refreshAccessToken(): Promise<{ accessToken: string; expirationTime: number }> {
    const version = this._config.apiVersion ?? 'v21.0'
    // ig_refresh_token must be called on graph.instagram.com, NOT graph.facebook.com
    const refreshUrl = `https://graph.instagram.com/${version}/refresh_access_token`
    const query = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: this._config.accessToken,
    })
    const response = await axios.get(`${refreshUrl}?${query.toString()}`)
    const { access_token, expires_in } = z.object({ access_token: z.string(), expires_in: z.number() }).parse(response.data)
    return { accessToken: access_token, expirationTime: Date.now() + expires_in * 1000 }
  }

  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    return handleInstagramWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onMessagingItem: async (item) => {
        await this._processMessagingItem(item)
      },
    })
  }


  private async _sendMessage(recipient: InstagramRecipientId, message: any): Promise<{ recipient_id: string; message_id: string }> {
    // iG tokens (Instagram API through Instagram Login) are passed as an
    // access_token query param, NOT as Authorization: Bearer.
    // With graph.instagram.com + iG token, /me resolves to the Business account.
    const url = `${this._instagramApiUrl}/me/messages?access_token=${this._config.accessToken}`
    const payload = {
      recipient,
      messaging_type: 'RESPONSE',
      message,
    }

    this._logger.debug(`[Instagram] Sending message to ${'id' in recipient ? recipient.id : recipient.comment_id}: ${JSON.stringify(message)}`)

    let response
    try {
      response = await axios.post(url, payload)
    } catch (error: any) {
      const errorBody = error?.response?.data
      const errorStatus = error?.response?.status
      if (errorBody) {
        this._logger.error(`[Instagram] Send failed${errorStatus ? ` (${errorStatus})` : ''}: ${JSON.stringify(errorBody)}`)
      } else {
        this._logger.error(`[Instagram] Send failed: ${error?.message ?? 'Unknown error'}`)
      }
      throw error
    }

    this._logger.debug(`[Instagram] Send response: ${JSON.stringify(response.data)}`)
    return response.data
  }

  private async _processMessagingItem(item: any): Promise<void> {
    const incoming = normalizeInstagramMessagingItem(item)
    if (!incoming) {
      return
    }

    if (!incoming.senderName || !incoming.username) {
      try {
        const profile = await this.getUserProfile(incoming.senderId)
        incoming.senderName = incoming.senderName ?? (profile.name || profile.username)
        incoming.username = incoming.username ?? profile.username
      } catch (error: any) {
        this._logger.warn(`[Instagram] Failed to fetch sender profile for ${incoming.senderId}: ${error.message}`)
      }
    }

    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`Instagram message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }

}
