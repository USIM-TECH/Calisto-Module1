import crypto from 'node:crypto'

export type LlmStage = 'planner' | 'answerer' | 'classifier' | 'title' | 'healthcheck' | 'other'

export interface ProviderUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reported?: boolean
}

export interface LlmTelemetryEvent {
  requestId: string
  provider: string
  model: string
  stage: LlmStage
  channel?: string
  accountId?: string
  startedAt: string
  durationMs: number
  success: boolean
  errorCategory?: string
  usage: ProviderUsage
  estimatedCost?: number
}

export interface LlmPricing { inputPer1k?: number; outputPer1k?: number }

/** Pricing is deliberately empty for hosted models until a validated rate is configured. */
export type LlmPricingTable = Record<string, LlmPricing>

function estimateTokens(text: string): number { return Math.max(0, Math.ceil(text.length / 4)) }

export function estimateUsage(input: string, output: string, reported?: ProviderUsage): ProviderUsage {
  const local = { inputTokens: estimateTokens(input), outputTokens: estimateTokens(output), reported: false }
  return reported?.reported ? { ...local, ...reported, totalTokens: reported.totalTokens ?? (reported.inputTokens ?? 0) + (reported.outputTokens ?? 0) } : { ...local, totalTokens: local.inputTokens + local.outputTokens }
}

export function estimateCost(usage: ProviderUsage, pricing?: LlmPricing): number | undefined {
  if (!pricing || usage.inputTokens === undefined || usage.outputTokens === undefined) return undefined
  return (usage.inputTokens / 1000) * (pricing.inputPer1k ?? 0) + (usage.outputTokens / 1000) * (pricing.outputPer1k ?? 0)
}

export class LlmTelemetry {
  private readonly _events: LlmTelemetryEvent[] = []
  constructor(private readonly _pricing: LlmPricingTable = {}) {}

  public record(event: Omit<LlmTelemetryEvent, 'estimatedCost'>): void {
    const estimatedCost = estimateCost(event.usage, this._pricing[`${event.provider}:${event.model}`] ?? this._pricing[event.provider])
    this._events.push({ ...event, estimatedCost })
    if (this._events.length > 10_000) this._events.shift()
  }

  public snapshot() {
    const byProvider: Record<string, { requests: number; successes: number; failures: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number; latencyMs: number[] }> = {}
    for (const event of this._events) {
      const key = `${event.provider}:${event.model}`
      const item = byProvider[key] ??= { requests: 0, successes: 0, failures: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, latencyMs: [] }
      item.requests += 1
      if (event.success) item.successes += 1
      else item.failures += 1
      item.inputTokens += event.usage.inputTokens ?? 0
      item.outputTokens += event.usage.outputTokens ?? 0
      item.totalTokens += event.usage.totalTokens ?? 0
      item.estimatedCost += event.estimatedCost ?? 0
      item.latencyMs.push(event.durationMs)
    }
    return { totalRequests: this._events.length, events: this._events.map((event) => ({ ...event })), byProvider }
  }

  public static requestId(): string { return crypto.randomUUID() }
}
