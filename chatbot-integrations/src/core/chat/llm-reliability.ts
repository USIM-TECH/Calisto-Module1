import axios from 'axios'
import type { ChatMessage, GenerateOptions, LlmProvider } from './llm-provider.js'

export type LlmErrorCategory =
  | 'invalid_credentials'
  | 'permission_or_quota'
  | 'rate_limited'
  | 'timeout'
  | 'network_failure'
  | 'provider_unavailable'
  | 'invalid_request'
  | 'structured_output_failure'
  | 'malformed_response'
  | 'circuit_open'
  | 'unknown'

export function classifyLlmError(error: unknown): LlmErrorCategory {
  if (error instanceof Error && error.message === 'LLM circuit is open') return 'circuit_open'
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const code = String(error.code ?? '')
    const providerStatus = String((error.response?.data as any)?.error?.status ?? '')
    if (status === 401 || providerStatus === 'UNAUTHENTICATED') return 'invalid_credentials'
    if (status === 403 || status === 402 || providerStatus === 'PERMISSION_DENIED' || providerStatus === 'RESOURCE_EXHAUSTED') return 'permission_or_quota'
    if (status === 429) return 'rate_limited'
    if (status === 400 || providerStatus === 'INVALID_ARGUMENT') return 'invalid_request'
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout'
    if (!status || ['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code)) return 'network_failure'
    if (status >= 500) return 'provider_unavailable'
  }
  const code = String((error as any)?.code ?? '')
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout'
  if (['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code)) return 'network_failure'
  if (error instanceof Error && /non-JSON|empty response|returned an empty/i.test(error.message)) return 'malformed_response'
  if (error instanceof Error && /json|structured/i.test(error.message)) return 'structured_output_failure'
  return 'unknown'
}

export function isTransientLlmError(category: LlmErrorCategory): boolean {
  return category === 'rate_limited' || category === 'timeout' || category === 'network_failure' || category === 'provider_unavailable'
}

export interface ReliabilityOptions {
  maxAttempts?: number
  failureThreshold?: number
  cooldownMs?: number
  maxCalls?: number
  sleep?: (ms: number) => Promise<void>
  fallback?: LlmProvider
  fallbackEnabled?: boolean
}

interface BreakerState { failures: number; openedAt?: number; halfOpen: boolean }

export class ReliableLlmProvider implements LlmProvider {
  public readonly name: string
  public get lastUsage() { return this._provider.lastUsage }
  private readonly _state: BreakerState = { failures: 0, halfOpen: false }
  private readonly _options: {
    maxAttempts: number; failureThreshold: number; cooldownMs: number; maxCalls: number
    sleep: (ms: number) => Promise<void>; fallback?: LlmProvider; fallbackEnabled: boolean
  }

  constructor(private readonly _provider: LlmProvider, options: ReliabilityOptions = {}) {
    this.name = _provider.name
    this._options = {
      maxAttempts: Math.max(1, options.maxAttempts ?? 1),
      failureThreshold: Math.max(1, options.failureThreshold ?? 3),
      cooldownMs: Math.max(0, options.cooldownMs ?? 30_000),
      maxCalls: Math.max(1, options.maxCalls ?? 2),
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      fallback: options.fallback,
      fallbackEnabled: options.fallbackEnabled ?? false,
    }
  }

  public async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const now = Date.now()
    if (this._state.openedAt !== undefined) {
      if (this._state.halfOpen || now - this._state.openedAt < this._options.cooldownMs) throw new Error('LLM circuit is open')
      this._state.halfOpen = true
    }
    let calls = 0
    let lastError: unknown
    for (let attempt = 1; attempt <= this._options.maxAttempts && calls < this._options.maxCalls; attempt += 1) {
      calls += 1
      try {
        const result = await this._provider.generate(messages, options)
        this._state.failures = 0
        this._state.openedAt = undefined
        this._state.halfOpen = false
        return result
      } catch (error) {
        lastError = error
        const category = classifyLlmError(error)
        if (!isTransientLlmError(category) || attempt >= this._options.maxAttempts || calls >= this._options.maxCalls) break
        const retryAfter = Number((axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined) ?? 0)
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(2_000, 100 * (2 ** (attempt - 1)))
        await this._options.sleep(delay)
      }
    }
    this._state.failures += 1
    if (this._state.failures >= this._options.failureThreshold) this._state.openedAt = Date.now()
    if (this._options.fallbackEnabled && this._options.fallback && isTransientLlmError(classifyLlmError(lastError))) {
      return this._options.fallback.generate(messages, options)
    }
    throw lastError
  }

  public healthCheck(): Promise<boolean> { return this._provider.healthCheck() }
}
