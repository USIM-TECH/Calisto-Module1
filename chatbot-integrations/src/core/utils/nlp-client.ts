import axios from 'axios'
import type { Logger } from './logger.js'


export interface NLPClientConfig {
  rasaUrl: string
  timeout?: number
  fallbackMessage?: string
}

export interface NLPRequestMetadata extends Record<string, unknown> {
  channel?: string
  senderName?: string
  sourceId?: string
  email?: string
  phone?: string
  location?: string
  originalText?: string
}

export interface NLPParseResponse {
  intent?: {
    name?: string
    confidence?: number
  }
  intentRanking?: Array<{
    name?: string
    confidence?: number
  }>
  entities?: Array<Record<string, unknown>>
}

export interface NLPTrackerSnapshot {
  latestIntent?: string
  latestIntentConfidence?: number
  activeLoop?: string
  requestedSlot?: string
  slots: Record<string, unknown>
}

export interface NLPResponse {
  text: string
  raw: Array<{ text?: string; image?: string; buttons?: any[]; custom?: Record<string, unknown> }>
  tracker?: NLPTrackerSnapshot
  ok: boolean
  fallbackUsed: boolean
  error?: string
  isConnectionError?: boolean
}

const DEFAULT_FALLBACK = "I'm having trouble right now. Please try again shortly."

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
    const timeout = this._config.timeout ?? 700
    const fallback = this._config.fallbackMessage ?? DEFAULT_FALLBACK

    const safeMessage = String(message).slice(0, 1000).trim()
    const safeSender = String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)

    if (!safeMessage) {
      return { text: fallback, raw: [], ok: false, fallbackUsed: true }
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
        return {
          text: fallback,
          raw: [],
          tracker: await this.getTracker(safeSender),
          ok: true,
          fallbackUsed: true,
        }
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
        ok: true,
        fallbackUsed: false,
      }
    } catch (error: any) {
      const isConnectionError = error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.message.includes('ECONNRESET')
      this._logger.error(`[NLP] Rasa error: ${error.message}${isConnectionError ? ' (Connection Error)' : ''}`)
      return { 
        text: fallback, 
        raw: [], 
        ok: false, 
        fallbackUsed: true, 
        error: error.message,
        isConnectionError,
      }
    }
  }

  public async parseMessage(message: string, metadata?: NLPRequestMetadata): Promise<NLPParseResponse | undefined> {
    const safeMessage = String(message).slice(0, 1000).trim()
    if (!safeMessage) {
      return undefined
    }

    try {
      const response = await axios.post(
        `${this._config.rasaUrl}/model/parse`,
        { text: safeMessage, metadata },
        { timeout: this._config.timeout ?? 700 },
      )

      const intent = response.data?.intent && typeof response.data.intent === 'object'
        ? {
            name: response.data.intent.name,
            confidence: Number(response.data.intent.confidence ?? 0),
          }
        : undefined
      const intentRanking = Array.isArray(response.data?.intent_ranking)
        ? response.data.intent_ranking.map((item: any) => ({
            name: item?.name,
            confidence: Number(item?.confidence ?? 0),
          }))
        : undefined
      const entities = Array.isArray(response.data?.entities) ? response.data.entities : undefined

      return { intent, intentRanking, entities }
    } catch (error: any) {
      this._logger.warn(`[NLP] Failed to parse message: ${error.message}`)
      return undefined
    }
  }

  public async getTracker(userId: string): Promise<NLPTrackerSnapshot | undefined> {
    try {
      const response = await axios.get(
        `${this._config.rasaUrl}/conversations/${encodeURIComponent(userId)}/tracker`,
        {
          params: { include_events: 'NONE' },
          timeout: this._config.timeout ?? 700,
        }
      )

      const slots = response.data?.slots && typeof response.data.slots === 'object'
        ? response.data.slots as Record<string, unknown>
        : {}
      const latestIntent = response.data?.latest_message?.intent?.name
      const latestIntentConfidence = Number(response.data?.latest_message?.intent?.confidence ?? 0)
      const activeLoop = typeof response.data?.active_loop?.name === 'string'
        ? response.data.active_loop.name
        : undefined
      const requestedSlot = typeof slots.requested_slot === 'string'
        ? slots.requested_slot
        : undefined

      return { latestIntent, latestIntentConfidence, activeLoop, requestedSlot, slots }
    } catch (error: any) {
      this._logger.warn(`[NLP] Failed to fetch tracker for ${userId}: ${error.message}`)
      return undefined
    }
  }

  public async deactivateActiveFlow(userId: string): Promise<void> {
    const safeSender = String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)

    try {
      await axios.post(
        `${this._config.rasaUrl}/conversations/${encodeURIComponent(safeSender)}/tracker/events`,
        [
          { event: 'slot', name: 'requested_slot', value: null },
          { event: 'slot', name: 'current_flow', value: null },
          { event: 'active_loop', name: null },
        ],
        { timeout: this._config.timeout ?? 700 },
      )
    } catch (error: any) {
      this._logger.warn(`[NLP] Failed to deactivate active flow for ${safeSender}: ${error.message}`)
    }
  }


  public async healthCheck(): Promise<{ ok: boolean; status?: string }> {
    try {
      const response = await axios.get(`${this._config.rasaUrl}/health`, {
        timeout: this._config.timeout ?? 700,
      })
      return { ok: true, status: response.data?.status ?? 'ok' }
    } catch {
      return { ok: false, status: 'unreachable' }
    }
  }
}
