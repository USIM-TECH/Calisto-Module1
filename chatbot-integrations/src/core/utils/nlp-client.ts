import axios from 'axios'
import type { Logger } from './logger.js'


export interface NLPClientConfig {
  rasaUrl: string
  timeout?: number
  fallbackMessage?: string
}

export interface NLPRequestMetadata {
  channel?: string
  senderName?: string
  sourceId?: string
  email?: string
  phone?: string
  location?: string
}

export interface NLPResponse {
  text: string
  raw: Array<{ text?: string; image?: string; buttons?: any[]; custom?: Record<string, unknown> }>
  tracker?: {
    latestIntent?: string
    slots: Record<string, unknown>
  }
}

const DEFAULT_FALLBACK = 'Sorry, something went wrong. Please try again.'

export class NLPClient {
  private _config: NLPClientConfig
  private _logger: Logger

  constructor(config: NLPClientConfig, logger: Logger) {
    this._config = config
    this._logger = logger
  }

  /**
   * Send a user message to the Rasa NLP and return the response.
   *
   * @param userId   - Unique identifier for the user / sender
   * @param message  - The message text to process
   * @returns        - NLPResponse with combined text and raw reply objects
   */
  public async getResponse(userId: string, message: string, metadata?: NLPRequestMetadata): Promise<NLPResponse> {
    const rasaUrl = this._config.rasaUrl
    const timeout = this._config.timeout ?? 10_000
    const fallback = this._config.fallbackMessage ?? DEFAULT_FALLBACK

    const safeMessage = String(message).slice(0, 1000).trim()
    const safeSender = String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)

    if (!safeMessage) {
      return { text: fallback, raw: [] }
    }

    try {
      this._logger.debug(`[NLP] Sending to Rasa: sender="${safeSender}", message="${safeMessage}"`)

      const response = await axios.post(
        `${rasaUrl}/webhooks/rest/webhook`,
        { sender: safeSender, message: safeMessage, metadata },
        { timeout }
      )

      const replies: Array<{ text?: string; image?: string; buttons?: any[]; custom?: Record<string, unknown> }> = response.data

      if (!Array.isArray(replies) || replies.length === 0) {
        this._logger.warn('[NLP] Rasa returned empty response')
        return { text: fallback, raw: [], tracker: await this.getTracker(safeSender) }
      }


      const combinedText = replies
        .map((r) => r.text)
        .filter(Boolean)
        .join('\n\n')

      this._logger.debug(`[NLP] Rasa response: ${combinedText.substring(0, 200)}...`)

      return {
        text: combinedText || fallback,
        raw: replies,
        tracker: await this.getTracker(safeSender),
      }
    } catch (error: any) {
      this._logger.error(`[NLP] Rasa error: ${error.message}`)
      return { text: fallback, raw: [] }
    }
  }

  public async getTracker(userId: string): Promise<NLPResponse['tracker']> {
    try {
      const response = await axios.get(
        `${this._config.rasaUrl}/conversations/${encodeURIComponent(userId)}/tracker`,
        {
          params: { include_events: 'NONE' },
          timeout: 5000,
        }
      )

      const slots = response.data?.slots && typeof response.data.slots === 'object'
        ? response.data.slots as Record<string, unknown>
        : {}
      const latestIntent = response.data?.latest_message?.intent?.name

      return { latestIntent, slots }
    } catch (error: any) {
      this._logger.warn(`[NLP] Failed to fetch tracker for ${userId}: ${error.message}`)
      return undefined
    }
  }


  public async healthCheck(): Promise<{ ok: boolean; status?: string }> {
    try {
      const response = await axios.get(`${this._config.rasaUrl}/health`, { timeout: 3000 })
      return { ok: true, status: response.data?.status ?? 'ok' }
    } catch {
      return { ok: false, status: 'unreachable' }
    }
  }
}
