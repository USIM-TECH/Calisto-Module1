import axios from 'axios'
import type { Logger } from './logger.js'

/**
 * Calisto NLP Client
 * ==================
 * Connects to the Rasa NLP server directly via the REST webhook endpoint.
 * Sends user messages and returns the generated text responses.
 *
 * Rasa endpoint: POST {RASA_URL}/webhooks/rest/webhook
 * Request body:  { sender: string, message: string }
 * Response:      Array<{ text?: string, image?: string, buttons?: any[] }>
 */

export interface NLPClientConfig {
  /** Rasa server URL (default: http://localhost:5005) */
  rasaUrl: string
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number
  /** Fallback message when NLP is unreachable */
  fallbackMessage?: string
}

export interface NLPResponse {
  /** Combined text from all Rasa reply objects */
  text: string
  /** Raw reply objects from Rasa (may include images, buttons, etc.) */
  raw: Array<{ text?: string; image?: string; buttons?: any[] }>
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
  public async getResponse(userId: string, message: string): Promise<NLPResponse> {
    const rasaUrl = this._config.rasaUrl
    const timeout = this._config.timeout ?? 10_000
    const fallback = this._config.fallbackMessage ?? DEFAULT_FALLBACK

    // Sanitise input (same guards as calisto_rasa_client.js)
    const safeMessage = String(message).slice(0, 1000).trim()
    const safeSender = String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)

    if (!safeMessage) {
      return { text: fallback, raw: [] }
    }

    try {
      this._logger.debug(`[NLP] Sending to Rasa: sender="${safeSender}", message="${safeMessage}"`)

      const response = await axios.post(
        `${rasaUrl}/webhooks/rest/webhook`,
        { sender: safeSender, message: safeMessage },
        { timeout }
      )

      const replies: Array<{ text?: string; image?: string; buttons?: any[] }> = response.data

      if (!Array.isArray(replies) || replies.length === 0) {
        this._logger.warn('[NLP] Rasa returned empty response')
        return { text: fallback, raw: [] }
      }

      // Combine all text replies into a single response string
      const combinedText = replies
        .map((r) => r.text)
        .filter(Boolean)
        .join('\n\n')

      this._logger.debug(`[NLP] Rasa response: ${combinedText.substring(0, 200)}...`)

      return {
        text: combinedText || fallback,
        raw: replies,
      }
    } catch (error: any) {
      this._logger.error(`[NLP] Rasa error: ${error.message}`)
      return { text: fallback, raw: [] }
    }
  }

  /**
   * Check if the Rasa NLP service is reachable.
   */
  public async healthCheck(): Promise<{ ok: boolean; status?: string }> {
    try {
      const response = await axios.get(`${this._config.rasaUrl}/health`, { timeout: 3000 })
      return { ok: true, status: response.data?.status ?? 'ok' }
    } catch {
      return { ok: false, status: 'unreachable' }
    }
  }
}
