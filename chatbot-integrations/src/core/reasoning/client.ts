import axios from 'axios'
import type { Logger } from '../utils/logger.js'
import type { LocalReasoningRequest, ReasoningDecision, RewriteRequest } from './types.js'

export interface LocalReasoningClientConfig {
  url?: string
  timeoutMs?: number
}

function normalizeDecision(payload: unknown): ReasoningDecision | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const record = payload as Record<string, unknown>
  const intent = typeof record.intent === 'string' ? record.intent.trim() : ''
  const emotion = typeof record.emotion === 'string' ? record.emotion.trim() : ''
  const response = typeof record.response === 'string' ? record.response.trim() : undefined

  if (!intent || !emotion) {
    return undefined
  }

  if (!['neutral', 'confused', 'frustrated', 'hesitant', 'interested'].includes(emotion)) {
    return undefined
  }

  return {
    intent,
    isSlotValid: Boolean(record.is_slot_valid ?? record.isSlotValid),
    isInterruption: Boolean(record.is_interruption ?? record.isInterruption),
    emotion: emotion as ReasoningDecision['emotion'],
    useRag: Boolean(record.use_rag ?? record.useRag),
    response: response || undefined,
  }
}

export class LocalReasoningClient {
  private readonly _config: LocalReasoningClientConfig
  private readonly _logger: Logger

  constructor(config: LocalReasoningClientConfig, logger: Logger) {
    this._config = config
    this._logger = logger
  }

  public isEnabled(): boolean {
    return Boolean(this._config.url)
  }

  public async reason(input: LocalReasoningRequest): Promise<ReasoningDecision | undefined> {
    if (!this._config.url) {
      return undefined
    }

    try {
      const response = await axios.post(
        `${this._config.url.replace(/\/$/, '')}/reason`,
        {
          current_flow: input.currentFlow,
          expected_slot: input.expectedSlot,
          user_input: input.userInput,
          candidate_intent: input.candidateIntent,
          rasa_intent: input.rasaIntent,
          candidate_confidence: input.candidateConfidence,
        },
        { timeout: this._config.timeoutMs ?? 1000 },
      )

      return normalizeDecision(response.data)
    } catch (error: any) {
      this._logger.warn(`[Reasoning] Local LLM request failed: ${error.message}`)
      return undefined
    }
  }

  public async rewrite(input: RewriteRequest): Promise<string | undefined> {
    if (!this._config.url) {
      return undefined
    }

    try {
      const response = await axios.post(
        `${this._config.url.replace(/\/$/, '')}/rewrite`,
        {
          user_input: input.userInput,
          rasa_response: input.rasaResponse,
          emotion: input.emotion,
          intent: input.intent,
        },
        { timeout: this._config.timeoutMs ?? 10000 },
      )

      return response.data?.enhanced_response as string | undefined
    } catch (error: any) {
      this._logger.warn(`[Reasoning] Local LLM rewrite failed: ${error.message}`)
      return undefined
    }
  }

  public async healthCheck(): Promise<{ ok: boolean; status: string; backend?: string }> {
    if (!this._config.url) {
      return { ok: false, status: 'disabled' }
    }

    try {
      const response = await axios.get(`${this._config.url.replace(/\/$/, '')}/health`, {
        timeout: this._config.timeoutMs ?? 1000,
      })
      return {
        ok: response.data?.status === 'ok',
        status: response.data?.status ?? 'ok',
        backend: response.data?.backend,
      }
    } catch {
      return { ok: false, status: 'unreachable' }
    }
  }
}
