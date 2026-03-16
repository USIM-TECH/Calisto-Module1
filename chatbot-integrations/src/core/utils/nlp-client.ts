import axios from 'axios'
import type { Logger } from './logger.js'


export interface NLPClientConfig {
  rasaUrl: string
  timeout?: number
  fallbackMessage?: string
}

export interface NLPResponse {
  text: string
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


  public async healthCheck(): Promise<{ ok: boolean; status?: string }> {
    try {
      const response = await axios.get(`${this._config.rasaUrl}/health`, { timeout: 3000 })
      return { ok: true, status: response.data?.status ?? 'ok' }
    } catch {
      return { ok: false, status: 'unreachable' }
    }
  }
}
