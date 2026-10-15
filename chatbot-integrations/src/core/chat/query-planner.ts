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
    polarized: { type: 'string' },
    uv_protection: { type: 'string' },
    budget_min: { type: 'number' },
    budget_max: { type: 'number' },
    price_modifier: { type: 'string' },
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
    polarized: pickYes(data.polarized),
    uvProtection: pickYes(data.uv_protection),
    budgetMin: pickNumber(data.budget_min),
    budgetMax: pickNumber(data.budget_max),
    priceModifier: PRICE_MODIFIERS.has(String(data.price_modifier)) ? String(data.price_modifier) : undefined,
  }
  if (filters.budgetMin !== undefined && filters.budgetMax !== undefined && filters.budgetMin > filters.budgetMax) {
    delete filters.budgetMin
  }
  for (const key of Object.keys(filters) as Array<keyof ProductSearchQuery>) {
    if (filters[key] === undefined) delete filters[key]
  }
  return { intent, filters }
}

export class QueryPlanner {
  constructor(private readonly _provider: LlmProvider) {}

  public async plan(message: string, history: ChatMessage[], vocab: CatalogueVocabulary): Promise<ChatPlan> {
    const raw = await this._provider.generate(
      [
        { role: 'system', content: buildSystemPrompt(vocab) },
        {
          role: 'user',
          content: JSON.stringify({ recent_conversation: history, customer_message: message }),
        },
      ],
      { temperature: 0, jsonSchema: PLAN_SCHEMA },
    )
    try {
      return sanitizePlan(JSON.parse(raw), vocab)
    } catch {
      // Unparseable output: treat it as a plain product question rather than failing the chat.
      return FALLBACK_PLAN
    }
  }
}
