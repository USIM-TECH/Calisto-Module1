import axios, { type AxiosInstance } from 'axios'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GenerateOptions {
  temperature?: number
  /** When set, the model is constrained to return JSON matching this schema. */
  jsonSchema?: Record<string, unknown>
}

export type HostedLlmProviderName = 'gemini' | 'openai' | 'anthropic' | 'groq'

export interface HostedLlmProviderConfig {
  provider: HostedLlmProviderName
  apiKey: string
  model: string
  timeoutMs: number
  temperature: number
}

export interface DiscoveredGeminiModel { id: string; displayName: string }

/** Uses Google's trusted models.list endpoint; the key never leaves this backend process. */
export async function discoverGeminiModels(apiKey: string, timeoutMs: number): Promise<DiscoveredGeminiModel[]> {
  const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', { params: { key: apiKey }, timeout: timeoutMs })
  return (response.data?.models ?? [])
    .filter((model: any) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
    .map((model: any) => ({ id: String(model.name ?? '').replace(/^models\//, ''), displayName: String(model.displayName ?? model.name ?? '') }))
    .filter((model: DiscoveredGeminiModel) => Boolean(model.id))
    .sort((a: DiscoveredGeminiModel, b: DiscoveredGeminiModel) => a.id.localeCompare(b.id))
}

/**
 * The only thing chat mode needs from an LLM. Keeping it this small is what
 * lets us swap Ollama for a hosted model later without touching the chat service.
 */
export interface LlmProvider {
  readonly name: string
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string>
  healthCheck(): Promise<boolean>
}

export interface OllamaProviderConfig {
  ollamaUrl: string
  model: string
  timeoutMs: number
  temperature: number
}

export class OllamaProvider implements LlmProvider {
  public readonly name = 'ollama'
  private readonly _http: AxiosInstance

  constructor(private readonly _config: OllamaProviderConfig) {
    this._http = axios.create({ baseURL: _config.ollamaUrl, timeout: _config.timeoutMs })
  }

  public async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    const response = await this._http.post('/api/chat', {
      model: this._config.model,
      stream: false,
      format: options.jsonSchema,
      options: { temperature: options.temperature ?? this._config.temperature },
      messages,
    })
    const content = response.data?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Ollama returned an empty response')
    }
    return content.trim()
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this._http.get('/api/tags', { timeout: 3_000 })
      return true
    } catch {
      return false
    }
  }
}

function structuredInstruction(schema?: Record<string, unknown>): string | undefined {
  return schema
    ? `Return JSON only. It must match this JSON schema exactly: ${JSON.stringify(schema)}`
    : undefined
}

function promptMessages(messages: ChatMessage[], schema?: Record<string, unknown>): ChatMessage[] {
  const instruction = structuredInstruction(schema)
  if (!instruction) return messages
  return [...messages, { role: 'system', content: instruction }]
}

function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const value = { ...schema }
  if (typeof value.type === 'string') value.type = value.type.toUpperCase()
  if (value.properties && typeof value.properties === 'object') {
    value.properties = Object.fromEntries(Object.entries(value.properties as Record<string, unknown>).map(([key, child]) => [key, geminiSchema(child as Record<string, unknown>)]))
  }
  if (value.items && typeof value.items === 'object') value.items = geminiSchema(value.items as Record<string, unknown>)
  return value
}

/** Hosted adapters normalize provider-specific response envelopes to the same chat contract. */
export class HostedLlmProvider implements LlmProvider {
  public readonly name: HostedLlmProviderName
  private readonly _http: AxiosInstance

  constructor(private readonly _config: HostedLlmProviderConfig) {
    this.name = _config.provider
    this._http = axios.create({ timeout: _config.timeoutMs })
  }

  public async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    if (this._config.provider === 'openai' || this._config.provider === 'groq') return this._openAi(messages, options)
    if (this._config.provider === 'anthropic') return this._anthropic(messages, options)
    return this._gemini(messages, options)
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.generate([{ role: 'user', content: 'Reply with OK.' }], { temperature: 0 })
      return true
    } catch {
      return false
    }
  }

  private async _openAi(messages: ChatMessage[], options: GenerateOptions): Promise<string> {
    const endpoint = this._config.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
    const response = await this._http.post(endpoint, {
      model: this._config.model,
      messages: promptMessages(messages, options.jsonSchema),
      temperature: options.temperature ?? this._config.temperature,
      response_format: options.jsonSchema ? { type: 'json_object' } : undefined,
    }, { headers: { Authorization: `Bearer ${this._config.apiKey}` } })
    return extractOpenAiText(response.data)
  }

  private async _anthropic(messages: ChatMessage[], options: GenerateOptions): Promise<string> {
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')
    const response = await this._http.post('https://api.anthropic.com/v1/messages', {
      model: this._config.model,
      max_tokens: 1200,
      temperature: options.temperature ?? this._config.temperature,
      system: [system, structuredInstruction(options.jsonSchema)].filter(Boolean).join('\n'),
      messages: messages.filter((message) => message.role !== 'system'),
    }, { headers: { 'x-api-key': this._config.apiKey, 'anthropic-version': '2023-06-01' } })
    return extractAnthropicText(response.data)
  }

  private async _gemini(messages: ChatMessage[], options: GenerateOptions): Promise<string> {
    const response = await this._http.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this._config.model)}:generateContent`,
      {
        contents: messages.filter((message) => message.role !== 'system').map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        systemInstruction: { parts: [{ text: messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n') }] },
        generationConfig: {
          temperature: options.temperature ?? this._config.temperature,
          responseMimeType: options.jsonSchema ? 'application/json' : undefined,
          responseSchema: options.jsonSchema ? geminiSchema(options.jsonSchema) : undefined,
        },
      },
      { params: { key: this._config.apiKey } },
    )
    return extractGeminiText(response.data)
  }
}

export function extractOpenAiText(data: unknown): string {
  const content = (data as any)?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('OpenAI returned an empty response')
  return content.trim()
}

export function extractAnthropicText(data: unknown): string {
  const content = (data as any)?.content?.find((item: any) => item?.type === 'text')?.text
  if (typeof content !== 'string' || !content.trim()) throw new Error('Anthropic returned an empty response')
  return content.trim()
}

export function extractGeminiText(data: unknown): string {
  const content = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof content !== 'string' || !content.trim()) throw new Error('Gemini returned an empty response')
  return content.trim()
}
