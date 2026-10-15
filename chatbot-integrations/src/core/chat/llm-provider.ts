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
