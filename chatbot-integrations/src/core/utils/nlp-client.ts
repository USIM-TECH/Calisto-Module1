import axios from 'axios'
import type { Logger } from './logger.js'
import {
  buildRasaIntentPayload,
  LlmIntentClassifier,
  type LlmClassification,
} from './llm-client.js'


export interface NLPClientConfig {
  rasaUrl: string
  timeout?: number
  fallbackMessage?: string
  /**
   * If Rasa NLU returns an intent with confidence below this threshold (or the
   * intent is `nlu_fallback`), the message is rerouted through the LLM
   * fallback classifier. Defaults to 0.4 to match the Rasa pipeline's
   * `FallbackClassifier` threshold in `config.yml`.
   */
  nluConfidenceFloor?: number
  /**
   * If the LLM fallback classifier returns confidence below this threshold (or
   * intent `nlu_fallback`), the original raw text is forwarded to Rasa so its
   * own fallback rule fires (`utter_default`). Defaults to 0.35.
   */
  llmConfidenceFloor?: number
  isolateTrackersByChannel?: boolean
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
    activeLoop?: string
    slots: Record<string, unknown>
  }
  /** Set when the LLM fallback was invoked for this turn. */
  llm?: {
    intent: string
    confidence: number
    entities: Record<string, string>
    payload: string
  }
}

const DEFAULT_FALLBACK = 'Sorry, something went wrong. Please try again.'
const DEFAULT_NLU_FLOOR = 0.4
const DEFAULT_LLM_FLOOR = 0.35

interface RasaParseResult {
  intent: string
  confidence: number
}

export class NLPClient {
  private _config: NLPClientConfig
  private _logger: Logger
  private _llm?: LlmIntentClassifier

  constructor(
    config: NLPClientConfig,
    logger: Logger,
    llm?: LlmIntentClassifier,
  ) {
    this._config = config
    this._logger = logger
    this._llm = llm
  }

  public get llmEnabled(): boolean {
    return Boolean(this._llm)
  }

  /**
   * Send a user message to Rasa.
   *
   * Flow:
   *   1. If the conversation is inside an active form, or the message is
   *      already an intent-trigger payload (`/intent_name`), forward it raw.
   *   2. Otherwise, call Rasa's `/model/parse` to see what its NLU thinks.
   *   3. If Rasa is confident (intent != `nlu_fallback` and confidence >=
   *      `nluConfidenceFloor`), forward the raw text — Rasa will re-parse and
   *      run its rules normally.
   *   4. If Rasa is *not* confident, ask the LLM (Llama 3 via Ollama) to
   *      classify. If the LLM is confident (intent != `nlu_fallback` and
   *      confidence >= `llmConfidenceFloor`), send the resulting
   *      `/intent{...}` payload to Rasa so it can run the rule the user
   *      actually wanted.
   *   5. If the LLM is also unsure, forward the raw text and let Rasa's own
   *      `FallbackClassifier` + `action_default_fallback` produce the
   *      user-facing fallback message.
   */
  public async getResponse(userId: string, message: string, metadata?: NLPRequestMetadata): Promise<NLPResponse> {
    const startedAt = Date.now()
    const rasaUrl = this._config.rasaUrl
    const timeout = this._config.timeout ?? 10_000
    const fallback = this._config.fallbackMessage ?? DEFAULT_FALLBACK
    const nluFloor = this._config.nluConfidenceFloor ?? DEFAULT_NLU_FLOOR
    const llmFloor = this._config.llmConfidenceFloor ?? DEFAULT_LLM_FLOOR

    const safeMessage = String(message).slice(0, 1000).trim()
    const senderNamespace = this._config.isolateTrackersByChannel && metadata?.channel
      ? `${metadata.channel}:${userId}`
      : userId
    const safeSender = String(senderNamespace).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 80)

    if (!safeMessage) {
      return { text: fallback, raw: [] }
    }

    const preTracker = await this.getTracker(safeSender)
    const isInsideForm = Boolean(preTracker?.activeLoop)
    const preferredLanguage = typeof preTracker?.slots.preferred_language === 'string'
      ? preTracker.slots.preferred_language as string
      : undefined

    let llmResult: LlmClassification | undefined
    let rasaMessage = safeMessage
    let route: 'raw' | 'llm-trigger' | 'fallback-raw' | 'skip' = 'raw'

    if (isInsideForm || safeMessage.startsWith('/')) {
      route = 'skip'
    } else {
      const parseResult = await this._parseWithRasa(safeMessage)

      if (parseResult && parseResult.intent !== 'nlu_fallback' && parseResult.confidence >= nluFloor) {
        this._logger.debug(
          `[NLU] Rasa classified "${truncateForLog(safeMessage)}" as ${parseResult.intent} ` +
          `(confidence=${parseResult.confidence.toFixed(2)}) — forwarding raw text`,
        )
        route = 'raw'
      } else if (this._llm) {
        const reason = parseResult
          ? `${parseResult.intent}@${parseResult.confidence.toFixed(2)}`
          : 'parse-failed'
        this._logger.info(
          `[NLU] Rasa unsure (${reason}) for "${truncateForLog(safeMessage)}" — invoking LLM fallback`,
        )

        try {
          llmResult = await this._llm.classify(safeMessage, { preferredLanguage })

          if (
            llmResult.intent !== 'nlu_fallback'
            && llmResult.confidence >= llmFloor
          ) {
            rasaMessage = buildRasaIntentPayload(llmResult)
            route = 'llm-trigger'
            this._logger.info(
              `[LLM] Routed "${truncateForLog(safeMessage)}" -> ${rasaMessage} ` +
              `(confidence=${llmResult.confidence.toFixed(2)})`,
            )
          } else {
            route = 'fallback-raw'
            this._logger.info(
              `[LLM] Low confidence (${llmResult.confidence.toFixed(2)}) for ` +
              `"${truncateForLog(safeMessage)}" — letting Rasa fallback fire`,
            )
          }
        } catch (error: any) {
          this._logger.error(`[LLM] Classification failed, letting Rasa fallback fire: ${error.message}`)
          route = 'fallback-raw'
        }
      } else {
        this._logger.debug(
          `[NLU] Rasa unsure and LLM disabled — letting Rasa fallback fire for "${truncateForLog(safeMessage)}"`,
        )
        route = 'fallback-raw'
      }
    }

    try {
      this._logger.debug(`[NLP] Sending to Rasa: sender="${safeSender}", message="${truncateForLog(rasaMessage)}", route=${route}`)

      const response = await axios.post(
        `${rasaUrl}/webhooks/rest/webhook`,
        { sender: safeSender, message: rasaMessage, metadata },
        { timeout }
      )

      const rawReplies: Array<{ text?: string; image?: string; buttons?: any[]; custom?: Record<string, unknown> }> = response.data

      if (!Array.isArray(rawReplies) || rawReplies.length === 0) {
        this._logger.warn('[NLP] Rasa returned empty response')
        return {
          text: fallback,
          raw: [],
          tracker: await this.getTracker(safeSender),
          llm: llmResult ? this._serializeLlm(llmResult, rasaMessage) : undefined,
        }
      }

      const postTracker = await this.getTracker(safeSender)
      const combinedText = rawReplies
        .map((r) => r.text)
        .filter(Boolean)
        .join('\n\n')

      this._logger.debug(`[NLP] Rasa response: ${combinedText.substring(0, 200)}...`)
      this._logger.info(JSON.stringify({
        event: 'nlp_turn',
        channel: metadata?.channel,
        sender_id: redactIdentifier(safeSender),
        route,
        intent: postTracker?.latestIntent,
        llm_used: Boolean(llmResult),
        latency_ms: Date.now() - startedAt,
      }))

      return {
        text: combinedText || fallback,
        raw: rawReplies,
        tracker: postTracker,
        llm: llmResult ? this._serializeLlm(llmResult, rasaMessage) : undefined,
      }
    } catch (error: any) {
      this._logger.error(`[NLP] Rasa error: ${describeAxiosError(error, `${rasaUrl}/webhooks/rest/webhook`)}`)
      this._logger.info(JSON.stringify({
        event: 'nlp_turn',
        channel: metadata?.channel,
        sender_id: redactIdentifier(safeSender),
        route,
        llm_used: Boolean(llmResult),
        latency_ms: Date.now() - startedAt,
        status: 'error',
      }))
      return { text: fallback, raw: [] }
    }
  }

  /**
   * Hit Rasa's `/model/parse` to inspect what its NLU thinks of the message
   * without producing a reply. Returns `undefined` on transport errors so the
   * caller can decide whether to fall back to the LLM.
   */
  private async _parseWithRasa(text: string): Promise<RasaParseResult | undefined> {
    const url = `${this._config.rasaUrl}/model/parse`
    try {
      const response = await axios.post(url, { text }, { timeout: 5_000 })
      const intent = response.data?.intent
      if (!intent || typeof intent.name !== 'string') {
        return undefined
      }
      const confidence = typeof intent.confidence === 'number' ? intent.confidence : 0
      return { intent: intent.name, confidence }
    } catch (error: any) {
      this._logger.warn(`[NLU] /model/parse failed: ${describeAxiosError(error, url)}`)
      return undefined
    }
  }

  public async getTracker(userId: string): Promise<NLPResponse['tracker']> {
    const url = `${this._config.rasaUrl}/conversations/${encodeURIComponent(userId)}/tracker`
    try {
      const response = await axios.get(url, {
        params: { include_events: 'NONE' },
        timeout: 5000,
      })

      const slots = response.data?.slots && typeof response.data.slots === 'object'
        ? response.data.slots as Record<string, unknown>
        : {}
      const latestIntent = response.data?.latest_message?.intent?.name
      const activeLoopRaw = response.data?.active_loop
      const activeLoop = typeof activeLoopRaw === 'string'
        ? activeLoopRaw
        : (activeLoopRaw && typeof activeLoopRaw === 'object' && typeof activeLoopRaw.name === 'string')
          ? activeLoopRaw.name as string
          : undefined

      return { latestIntent, activeLoop, slots }
    } catch (error: any) {
      this._logger.warn(`[NLP] Failed to fetch tracker for ${userId}: ${describeAxiosError(error, url)}`)
      return undefined
    }
  }


  public async healthCheck(): Promise<{
    ok: boolean
    status?: string
    llm?: { ok: boolean; status?: string }
  }> {
    const llmHealth = this._llm ? await this._llm.healthCheck() : undefined
    try {
      const response = await axios.get(`${this._config.rasaUrl}/health`, { timeout: 3000 })
      return { ok: true, status: response.data?.status ?? 'ok', llm: llmHealth }
    } catch {
      return { ok: false, status: 'unreachable', llm: llmHealth }
    }
  }

  private _serializeLlm(classification: LlmClassification, payload: string): NonNullable<NLPResponse['llm']> {
    return {
      intent: classification.intent,
      confidence: classification.confidence,
      entities: classification.entities,
      payload,
    }
  }
}

function truncateForLog(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value
}

function redactIdentifier(value: string): string {
  if (value.length <= 6) {
    return '***'
  }
  return `${value.slice(0, 3)}...${value.slice(-3)}`
}

/**
 * Axios throws errors whose `.message` is often empty or generic ("Request failed with status code 500").
 * Build a human-readable string that captures the HTTP status, URL, and error
 * code (ECONNREFUSED, ETIMEDOUT, etc.) so blank log lines never happen.
 */
function describeAxiosError(error: any, url: string): string {
  const parts: string[] = []
  if (error?.code) parts.push(`code=${error.code}`)
  if (error?.response?.status) parts.push(`status=${error.response.status}`)
  parts.push(`url=${url}`)
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : (error?.code === 'ECONNREFUSED' ? 'connection refused (Rasa is not running)' : 'unknown error')
  parts.push(`msg="${message}"`)
  return parts.join(' ')
}
