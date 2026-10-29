import type { Logger } from '../utils/index.js'
import { discoverGeminiModels, HostedLlmProvider, OllamaProvider, type DiscoveredGeminiModel, type GenerateOptions, type LlmProvider, type ChatMessage, type OllamaProviderConfig } from './llm-provider.js'
import type { ProviderConfigStore } from './provider-config-store.js'

export class RuntimeLlmProvider implements LlmProvider {
  public readonly name = 'runtime'
  constructor(private readonly _resolve: () => Promise<{ provider: LlmProvider; config?: { id: string; provider: string; model: string } }>, private readonly _logger: Logger) {}
  public async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const start = Date.now()
    const resolved = await this._resolve()
    const stage = /You classify customer messages/i.test(messages[0]?.content ?? '') ? 'planner' : /Calisto shopping assistant/i.test(messages[0]?.content ?? '') ? 'answerer' : 'other'
    try {
      const response = await resolved.provider.generate(messages, options)
      this._logger.info(`[LLM] config=${resolved.config?.id ?? 'environment-ollama'} provider=${resolved.provider.name} model=${resolved.config?.model ?? 'configured'} stage=${stage} result=success latency_ms=${Date.now() - start}`)
      return response
    } catch (error: any) {
      this._logger.warn(`[LLM] config=${resolved.config?.id ?? 'environment-ollama'} provider=${resolved.provider.name} model=${resolved.config?.model ?? 'configured'} stage=${stage} result=failure latency_ms=${Date.now() - start} category=${error?.response?.status ?? error?.code ?? 'unknown'}`)
      throw error
    }
  }
  public async healthCheck(): Promise<boolean> {
    return (await this._resolve()).provider.healthCheck()
  }
}

export class LlmProviderManager {
  constructor(
    private readonly _store: ProviderConfigStore | undefined,
    private readonly _ollama: OllamaProviderConfig,
    private readonly _logger: Logger,
  ) {}

  public runtimeProvider(): LlmProvider {
    return new RuntimeLlmProvider(() => this.resolveWithMetadata(), this._logger)
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
      return new OllamaProvider({ ...this._ollama, model: active?.model || this._ollama.model })
    }
    if (!active.apiKey) {
      this._logger.warn(`Active provider ${active.provider} has no key; request will use the safe Chat fallback`)
      throw new Error(`Active provider ${active.provider} is not configured`)
    }
    return new HostedLlmProvider({ provider: active.provider as 'gemini' | 'openai' | 'anthropic' | 'groq', apiKey: active.apiKey, model: active.model, timeoutMs: this._ollama.timeoutMs, temperature: this._ollama.temperature })
  }
}
