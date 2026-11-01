import type { ProductSearchQuery } from '../../products/types.js'
import type { ChatMessage, LlmProvider } from './llm-provider.js'

/**
 * What the customer is asking for. The planner only classifies and extracts
 * filters; it never answers, so the answer can't contain invented facts.
 */
export type ChatIntent = 'product' | 'knowledge' | 'chitchat' | 'off_topic'

export interface ChatPlan {
  intent: ChatIntent
  filters: ProductSearchQuery
  requestedCount?: number
}

export interface CatalogueVocabulary {
  productTypes: string[]
  brands: string[]
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['product', 'knowledge', 'chitchat', 'off_topic'] },
    product_type: { type: 'string' },
    brand: { type: 'string' },
    frame_color: { type: 'string' },
    frame_shape: { type: 'string' },
    frame_material: { type: 'string' },
    lens_type: { type: 'string' },
    lens_feature: { type: 'string' },
    lens_duration: { type: 'string' },
    polarized: { type: 'string' },
    uv_protection: { type: 'string' },
    budget_min: { type: 'number' },
    budget_max: { type: 'number' },
    price_modifier: { type: 'string' },
    exact_product_name: { type: 'string' },
    product_id: { type: 'string' },
    stock_required: { type: 'boolean' },
    requested_count: { type: 'number' },
  },
  required: ['intent'],
}

const FALLBACK_PLAN: ChatPlan = { intent: 'product', filters: {} }

function buildSystemPrompt(vocab: CatalogueVocabulary): string {
  return [
    'You classify customer messages for Calisto, an eyewear and contact lens retailer.',
    'Return JSON only. Do not answer the customer.',
    '',
    'intent:',
    '- product: asking about, browsing, comparing or buying eyewear, sunglasses, frames, lenses or contact lenses.',
    '- knowledge: asking about the business itself (store locations, opening hours, returns, warranty, eye tests, delivery, payment, policies).',
    '- Questions about choosing, wearing, comfort or suitability of any eyewear or lenses (for example "contact lenses for dry eyes" or "glasses for driving") are product questions, not knowledge.',
    '- chitchat: greetings, thanks, goodbyes.',
    '- off_topic: anything unrelated to Calisto or eyewear.',
    '',
    'For product intent, fill only the filters the customer clearly asked for. Leave the rest out.',
    `product_type must be one of: ${vocab.productTypes.join(', ') || '(none)'}.`,
    `brand must be one of: ${vocab.brands.join(', ') || '(none)'}.`,
    'polarized and uv_protection are "yes" when requested.',
    'budget_min and budget_max are numbers in MYR ("under 300" means budget_max 300).',
    'price_modifier is "cheap", "expensive" or "premium" only when the customer says so.',
    'For an exact named product or model, fill exact_product_name or product_id; never substitute another model.',
    'Set stock_required when the customer asks for in-stock or available products.',
    'Preserve explicit frame material, lens type, lens feature and wear duration requests exactly in their matching fields.',
    'Set requested_count when the customer asks for a specific number of products.',
    'Resolve words like "that one" or "cheaper ones" using the recent conversation.',
  ].join('\n')
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Budgets must be positive; models often emit 0 for "no budget", which would match nothing. */
function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }

export function applyExplicitConstraints(message: string, plan: ChatPlan): ChatPlan {
  const lower = message.toLowerCase()
  const budget = /(?:under|below|less than|at most|up to|<=)\s*(?:rm\s*)?(\d+(?:\.\d+)?)/i.exec(lower)
  if (budget) plan.filters.budgetMax = Number(budget[1])
  const budgetRange = /(?:between|from)\s*(?:rm\s*)?(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(?:rm\s*)?(\d+(?:\.\d+)?)/i.exec(lower)
  if (budgetRange) {
    plan.filters.budgetMin = Number(budgetRange[1])
    plan.filters.budgetMax = Number(budgetRange[2])
  }
  const budgetMinimum = /(?:from|over|above|at least|>=)\s*(?:rm\s*)?(\d+(?:\.\d+)?)/i.exec(lower)
  if (budgetMinimum && !budgetRange) plan.filters.budgetMin = Number(budgetMinimum[1])

  const count = /\b(?:recommend|show|find|suggest|give)\s+(?:me\s+)?(?:the\s+)?(\d+|one|two|three|four|five)\b/i.exec(lower)
  if (count) plan.requestedCount = Math.min(10, Number(count[1]) || NUMBER_WORDS[count[1].toLowerCase()] || 1)

  const productId = /\bP\d{3,}\b/i.exec(message)
  if (productId) plan.filters.productId = productId[0].toUpperCase()
  if (!plan.filters.productId) {
    const namedProduct = /\b([a-z][a-z&'-]*(?:\s+[a-z][a-z&'-]*){0,2}\s+(?:luxe\s+)?(?:sunglasses|frames|lenses)\s+\d+)\b/i.exec(message)
    if (namedProduct) plan.filters.productName = namedProduct[1].replace(/^(?:do you have|you have|show me|find)\s+/i, '')
  }
  if (/\b(?:in stock|available|currently available)\b/i.test(lower)) plan.filters.stockRequired = true
  return plan
}

/** Explicit negations remove constraints carried by an LLM or earlier turn. */
export function clearExplicitlyUnconstrained(message: string, plan: ChatPlan): ChatPlan {
  const lower = message.toLowerCase()
  if (/\b(?:any|all)\s+brands?\b/i.test(lower)) delete plan.filters.brand
  if (/\b(?:no|without)\s+(?:specific\s+)?budget\b|\bno budget specified\b/i.test(lower)) {
    delete plan.filters.budgetMin
    delete plan.filters.budgetMax
    delete plan.filters.budgetBucket
    delete plan.filters.priceRange
  }
  return plan
}

/** A new imperative product request starts a fresh constraint scope. */
export function scopePlanToMessage(message: string, plan: ChatPlan): ChatPlan {
  const lower = message.toLowerCase()
  const hasBudget = /(?:(?:under|below|less than|at most|up to|<=)\s*(?:rm\s*)?\d|(?:between|from)\s*(?:rm\s*)?\d+(?:\.\d+)?\s*(?:and|to|-)\s*(?:rm\s*)?\d|(?:over|above|at least|>=)\s*(?:rm\s*)?\d)/i.test(lower)
  const followUp = /\b(?:those|these|them|previous|earlier|just recommended|of the|cheapest|cheaper|first|second|third|which one|that one|more|another|other|options?)\b/i.test(lower)
  const freshRequest = /\b(?:recommend|show|find|suggest|give)\b/i.test(lower)
  if (freshRequest && !followUp && !hasBudget) {
    delete plan.filters.budgetMin
    delete plan.filters.budgetMax
    delete plan.filters.budgetBucket
    delete plan.filters.priceRange
  }
  return plan
}

/** polarized / uv_protection are only useful as "yes"; a "no" is the model filling in blanks. */
function pickYes(value: unknown): string | undefined {
  return typeof value === 'string' && /^(yes|true|y)$/i.test(value.trim()) ? 'yes' : undefined
}

/** Case, spacing and punctuation don't matter: "Ray-Ban" and "RayBan" are the same brand. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Returns the canonical spelling from `allowed`, or undefined if the model made one up. */
function matchVocabulary(value: unknown, allowed: string[]): string | undefined {
  const text = pickString(value)
  if (!text) return undefined
  const wanted = normalizeName(text)
  return allowed.find((candidate) => normalizeName(candidate) === wanted)
}

const PRICE_MODIFIERS = new Set(['cheap', 'expensive', 'premium'])
const INTENTS = new Set<ChatIntent>(['product', 'knowledge', 'chitchat', 'off_topic'])

/** Turns raw model JSON into a safe plan. Anything unexpected is dropped, not trusted. */
export function sanitizePlan(raw: unknown, vocab: CatalogueVocabulary): ChatPlan {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const intent = INTENTS.has(data.intent as ChatIntent) ? (data.intent as ChatIntent) : 'product'
  if (intent !== 'product') return { intent, filters: {} }

  const filters: ProductSearchQuery = {
    productType: matchVocabulary(data.product_type, vocab.productTypes),
    brand: matchVocabulary(data.brand, vocab.brands),
    frameColor: pickString(data.frame_color),
    frameShape: pickString(data.frame_shape),
    frameMaterial: pickString(data.frame_material),
    lensType: pickString(data.lens_type),
    lensFeature: pickString(data.lens_feature),
    lensDuration: pickString(data.lens_duration),
    polarized: pickYes(data.polarized),
    uvProtection: pickYes(data.uv_protection),
    budgetMin: pickNumber(data.budget_min),
    budgetMax: pickNumber(data.budget_max),
    priceModifier: PRICE_MODIFIERS.has(String(data.price_modifier)) ? String(data.price_modifier) : undefined,
    productName: pickString(data.exact_product_name),
    productId: pickString(data.product_id),
    stockRequired: data.stock_required === true ? true : undefined,
  }
  if (filters.budgetMin !== undefined && filters.budgetMax !== undefined && filters.budgetMin > filters.budgetMax) {
    delete filters.budgetMin
  }
  for (const key of Object.keys(filters) as Array<keyof ProductSearchQuery>) {
    if (filters[key] === undefined) delete filters[key]
  }
  return { intent, filters, requestedCount: pickNumber(data.requested_count) }
}

export class QueryPlanner {
  constructor(private readonly _provider: LlmProvider) {}

  public async plan(message: string, history: ChatMessage[], vocab: CatalogueVocabulary): Promise<ChatPlan> {
    const raw = await this._provider.generate(
      [
        { role: 'system', content: buildSystemPrompt(vocab) },
        {
          role: 'user',
          content: JSON.stringify({
            recent_conversation: history.map((entry) => ({ role: entry.role, content: entry.content.slice(0, 2_000) })),
            customer_message: message.slice(0, 2_000),
          }),
        },
      ],
      { temperature: 0, jsonSchema: PLAN_SCHEMA, stage: 'planner' },
    )
    try {
      return scopePlanToMessage(message, applyExplicitConstraints(message, sanitizePlan(JSON.parse(raw), vocab)))
    } catch {
      // Unparseable output: treat it as a plain product question rather than failing the chat.
      return FALLBACK_PLAN
    }
  }
}
