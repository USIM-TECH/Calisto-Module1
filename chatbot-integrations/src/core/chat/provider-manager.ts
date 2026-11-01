import type { Logger } from '../utils/index.js'
import { discoverGeminiModels, HostedLlmProvider, OllamaProvider, type DiscoveredGeminiModel, type GenerateOptions, type LlmProvider, type ChatMessage, type OllamaProviderConfig } from './llm-provider.js'
import type { ProviderConfigStore } from './provider-config-store.js'
import { LlmTelemetry, estimateUsage, type LlmStage } from './llm-telemetry.js'
import { ReliableLlmProvider, type ReliabilityOptions } from './llm-reliability.js'

export class RuntimeLlmProvider implements LlmProvider {
  public readonly name = 'runtime'
  constructor(private readonly _resolve: () => Promise<{ provider: LlmProvider; config?: { id: string; provider: string; model: string } }>, private readonly _logger: Logger, private readonly _telemetry?: LlmTelemetry) {}
  public async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const start = Date.now()
    const resolved = await this._resolve()
    const stage: LlmStage = options?.stage ?? (/You classify customer messages/i.test(messages[0]?.content ?? '') ? 'planner' : /Calisto shopping assistant/i.test(messages[0]?.content ?? '') ? 'answerer' : 'other')
    try {
      const response = await resolved.provider.generate(messages, options)
      this._telemetry?.record({ requestId: options?.requestId ?? LlmTelemetry.requestId(), provider: resolved.provider.name, model: resolved.config?.model ?? 'configured', stage, channel: options?.channel, accountId: options?.accountId, startedAt: new Date(start).toISOString(), durationMs: Date.now() - start, success: true, usage: estimateUsage(messages.map((message) => message.content).join('\n'), response, resolved.provider.lastUsage) })
      this._logger.info(`[LLM] config=${resolved.config?.id ?? 'environment-ollama'} provider=${resolved.provider.name} model=${resolved.config?.model ?? 'configured'} stage=${stage} result=success latency_ms=${Date.now() - start}`)
      return response
    } catch (error: any) {
      this._logger.warn(`[LLM] config=${resolved.config?.id ?? 'environment-ollama'} provider=${resolved.provider.name} model=${resolved.config?.model ?? 'configured'} stage=${stage} result=failure latency_ms=${Date.now() - start} category=${error?.response?.status ?? error?.code ?? 'unknown'}`)
      this._telemetry?.record({ requestId: options?.requestId ?? LlmTelemetry.requestId(), provider: resolved.provider.name, model: resolved.config?.model ?? 'configured', stage, channel: options?.channel, accountId: options?.accountId, startedAt: new Date(start).toISOString(), durationMs: Date.now() - start, success: false, errorCategory: error?.response?.status ?? error?.code ?? 'unknown', usage: estimateUsage(messages.map((message) => message.content).join('\n'), '', resolved.provider.lastUsage) })
      throw error
    }
  }
  public async healthCheck(): Promise<boolean> {
    return (await this._resolve()).provider.healthCheck()
  }
}

export class LlmProviderManager {
  private readonly _reliable = new Map<string, LlmProvider>()
  constructor(
    private readonly _store: ProviderConfigStore | undefined,
    private readonly _ollama: OllamaProviderConfig,
    private readonly _logger: Logger,
    private readonly _telemetry?: LlmTelemetry,
    private readonly _reliability: ReliabilityOptions = {},
  ) {}

  public runtimeProvider(telemetry?: LlmTelemetry): LlmProvider {
    return new RuntimeLlmProvider(() => this.resolveWithMetadata(), this._logger, telemetry ?? this._telemetry)
  }

  public async resolve(): Promise<LlmProvider> {
    return (await this.resolveWithMetadata()).provider
  }

  private async resolveWithMetadata(): Promise<{ provider: LlmProvider; config?: { id: string; provider: string; model: string } }> {
    const active = await this._store?.getActive()
    const config = active ?? { provider: 'ollama' as const, model: this._ollama.model }
    return { provider: this._fromConfig(config), config: active ? { id: active.id, provider: active.provider, model: active.model } : undefined }
  }

  public async resolveConfigured(id: string): Promise<LlmProvider> {
    const configured = await this._store?.getConfigured(id)
    if (!configured) throw new Error('Provider configuration is not available')
    return this._fromConfig(configured)
  }

  public async discoverGeminiModels(id: string): Promise<DiscoveredGeminiModel[]> {
    const configured = await this._store?.getConfigured(id)
    if (!configured || configured.provider !== 'gemini' || !configured.apiKey) throw new Error('Gemini credentials are not configured')
    return discoverGeminiModels(configured.apiKey, this._ollama.timeoutMs)
  }

  private _fromConfig(active: { provider: string; model: string; apiKey?: string }): LlmProvider {
    if (active.provider === 'ollama') {
      const key = `ollama:${active?.model || this._ollama.model}`
      const cached = this._reliable.get(key)
      if (cached) return cached
      const provider = new ReliableLlmProvider(new OllamaProvider({ ...this._ollama, model: active?.model || this._ollama.model }), this._reliability)
      this._reliable.set(key, provider)
      return provider
    }
    if (!active.apiKey) {
      this._logger.warn(`Active provider ${active.provider} has no key; request will use the safe Chat fallback`)
      throw new Error(`Active provider ${active.provider} is not configured`)
    }
    const key = `${active.provider}:${active.model}:${active.apiKey}`
    const cached = this._reliable.get(key)
    if (cached) return cached
    const provider = new ReliableLlmProvider(new HostedLlmProvider({ provider: active.provider as 'gemini' | 'openai' | 'anthropic' | 'groq', apiKey: active.apiKey, model: active.model, timeoutMs: this._ollama.timeoutMs, temperature: this._ollama.temperature }), this._reliability)
    this._reliable.set(key, provider)
    return provider
  }
}
