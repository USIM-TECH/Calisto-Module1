import type { ProductStore } from '../../products/storage/product-store.interface.js'
import type { ProductRecord } from '../../products/types.js'
import type { Logger } from '../utils/index.js'
import { Answerer, type StructuredChatAnswer } from './answerer.js'
import { leaksInstructions, looksLikeInjection } from './guard.js'
import type { ChatMessage, LlmProvider } from './llm-provider.js'
import { QueryPlanner } from './query-planner.js'
import type { ChatRetriever } from './retriever.js'

export interface ChatReply {
  text: string
  /** Products the answer is based on; the channel layer renders these as cards. */
  products: ProductRecord[]
}

export interface ChatServiceConfig {
  historyTurns: number
  fallbackMessage?: string
  offTopicMessage?: string
  greetingMessage?: string
  noInfoMessage?: string
  noMatchMessage?: string
}

const DEFAULT_FALLBACK =
  'Sorry, I am having trouble answering right now. Please try again in a moment, or contact the Calisto team and we will be happy to help.'
const DEFAULT_OFF_TOPIC =
  'I can only help with Calisto eyewear, sunglasses and contact lenses. Is there something in our range I can help you find?'
const DEFAULT_GREETING =
  'Hi! Welcome to Calisto. Tell me what you are looking for, like sunglasses, frames or contact lenses, and I will help you find it.'

const DEFAULT_NO_INFO =
  'I do not have that information to hand. Please contact the Calisto team and they will be happy to help.'

const DEFAULT_NO_MATCH =
  'I could not find a matching product for that. Could you tell me a bit more, like the type, brand or budget? Or contact the Calisto team and they will help you.'

function noMatchMessage(filters: import('../../products/types.js').ProductSearchQuery): string {
  const constraints = [
    filters.productName && `the exact product “${filters.productName}”`,
    filters.brand && `brand ${filters.brand}`,
    filters.productType && filters.productType,
    filters.budgetMax !== undefined && `under RM${filters.budgetMax.toFixed(2)}`,
    filters.stockRequired && 'currently available stock',
  ].filter(Boolean)
  return constraints.length > 0
    ? `I could not find a verified Calisto product matching ${constraints.join(', ')}. Try adjusting one of those filters and I can search again.`
    : DEFAULT_NO_MATCH
}

function includesProductRequest(message: string): boolean {
  return /\b(?:sunglasses|eyeglasses|glasses|frames?|lenses?|contact lenses?|products?|price|budget|in stock|available|recommend|show me|find)\b/i.test(message)
}

function requestedCatalogueBrand(message: string, brands: string[]): string | undefined {
  const normalized = message.toLowerCase().replace(/[^a-z0-9]/g, '')
  return brands.find((brand) => normalized.includes(brand.toLowerCase().replace(/[^a-z0-9]/g, '')))
}

function normalizedBrand(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Reject only an affirmative contradiction: a product name starts with another known catalogue brand. */
function conflictsWithRequestedBrand(product: ProductRecord, requestedBrand: string, brands: string[]): boolean {
  const name = normalizedBrand(product.productName)
  const namedBrand = brands.find((brand) => name.startsWith(normalizedBrand(brand)))
  return Boolean(namedBrand && normalizedBrand(namedBrand) !== normalizedBrand(requestedBrand))
}

/** Only records retrieved for this request can become recommendation cards. */
export function validateSelectedProducts(answer: StructuredChatAnswer, available: ProductRecord[]): ProductRecord[] {
  const byId = new Map(available.map((product) => [product.productId, product]))
  const seen = new Set<string>()
  const selected: ProductRecord[] = []
  for (const id of answer.productIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const product = byId.get(id)
    if (!product || product.stockStatus.toLowerCase() === 'out_of_stock') continue
    selected.push(product)
  }
  return selected
}

function canonicalProductText(products: ProductRecord[], requestedCount?: number, rationale?: string): string {
  if (products.length === 0) return DEFAULT_NO_MATCH
  const facts = products.map((product) => {
    const stock = product.stockStatus.toLowerCase().replace(/_/g, ' ')
    return `${product.productName} at RM${product.priceMyr.toFixed(2)} (${stock})`
  })
  const countNote = requestedCount && products.length < requestedCount
    ? ` I found only ${products.length} matching option${products.length === 1 ? '' : 's'} out of the ${requestedCount} requested.`
    : ''
  const safeRationale = rationale && !/\bRM\s*\d|\b(?:in|out of) stock\b/i.test(rationale) && !products.some((product) => rationale.toLowerCase().includes(product.productName.toLowerCase()))
    ? `${rationale.trim()} `
    : ''
  return `${safeRationale}Here are verified Calisto options: ${facts.join('; ')}.${countNote}`
}

async function priorProductIds(history: ChatMessage[], store: ProductStore): Promise<string[]> {
  const assistantText = history.filter((entry) => entry.role === 'assistant').map((entry) => entry.content.toLowerCase())
  if (assistantText.length === 0) return []
  const catalogue = await store.listAll()
  return catalogue
    .filter((product) => assistantText.some((text) => text.includes(product.productName.toLowerCase())))
    .map((product) => product.productId)
}

/**
 * Free-text assistant for "chat" response mode:
 * plan (what is being asked) -> retrieve (real data) -> answer (grounded text).
 */
export class ChatService {
  private readonly _planner: QueryPlanner
  private readonly _answerer: Answerer

  constructor(
    provider: LlmProvider,
    private readonly _retriever: ChatRetriever,
    private readonly _products: ProductStore,
    private readonly _config: ChatServiceConfig,
    private readonly _logger: Logger,
  ) {
    this._planner = new QueryPlanner(provider)
    this._answerer = new Answerer(provider)
  }

  public async reply(message: string, history: ChatMessage[] = []): Promise<ChatReply> {
    const recent = history.slice(-this._config.historyTurns)
    if (looksLikeInjection(message)) {
      this._logger.warn('[Chat] blocked a prompt-injection style message')
      return { text: this._config.offTopicMessage ?? DEFAULT_OFF_TOPIC, products: [] }
    }
    try {
      const vocab = {
        productTypes: await this._products.distinctProductTypes(),
        brands: await this._products.distinctBrands(),
      }
      const plan = await this._planner.plan(message, recent, vocab)
      if (plan.intent === 'chitchat' && includesProductRequest(message)) {
        plan.intent = 'product'
        const productType = vocab.productTypes.find((value) => /sunglass/i.test(message) && /sunglass/i.test(value))
          ?? vocab.productTypes.find((value) => /frame|glass|lens/i.test(message) && /frame|glass|lens/i.test(value))
        if (productType) plan.filters.productType = productType
      }
      if (plan.intent === 'product' && !plan.filters.brand) {
        const brand = requestedCatalogueBrand(message, vocab.brands)
        if (brand) plan.filters.brand = brand
      }
      this._logger.debug(`[Chat] intent=${plan.intent} filters=${JSON.stringify(plan.filters)}`)

      if (plan.intent === 'off_topic') {
        return { text: this._config.offTopicMessage ?? DEFAULT_OFF_TOPIC, products: [] }
      }
      // Mixed greetings such as "hi, I'm looking for sunglasses" are product
      // requests, even if a planner labels the opening phrase as chitchat.
      if (plan.intent === 'chitchat' && recent.length === 0 && !includesProductRequest(message)) {
        return { text: this._config.greetingMessage ?? DEFAULT_GREETING, products: [] }
      }

      const followUpComparison = plan.intent === 'product' && /\b(?:cheapest|cheaper|least expensive)\b/i.test(message)
      const previousIds = followUpComparison ? await priorProductIds(recent, this._products) : []
      const searchFilters = plan.intent === 'product'
        ? { ...plan.filters, ...(previousIds.length > 0 ? { productIds: previousIds } : {}), limit: plan.requestedCount }
        : null
      let context = await this._retriever.retrieve(message, searchFilters)
      if (plan.intent === 'product' && plan.filters.brand && !plan.filters.productId && !plan.filters.productName) {
        const safeProducts = context.products.filter((product) => !conflictsWithRequestedBrand(product, plan.filters.brand!, vocab.brands))
        for (const product of context.products) {
          if (!safeProducts.includes(product)) this._logger.warn(`[Chat] skipped suspected catalogue brand mismatch product=${product.productId}`)
        }
        context = { ...context, products: safeProducts }
      }
      if (plan.intent === 'product' && context.products.length === 0) {
        // Over-narrow filters are the usual cause, so retry on type and brand alone.
        const { productType, brand } = plan.filters
        const hasExactOrRequirement = Boolean(
          plan.filters.productId || plan.filters.productName || plan.filters.budgetMin !== undefined ||
          plan.filters.budgetMax !== undefined || plan.filters.stockRequired,
        )
        if (!hasExactOrRequirement && Object.keys(plan.filters).some((key) => key !== 'productType' && key !== 'brand')) {
          context = await this._retriever.retrieve(message, { productType, brand, limit: plan.requestedCount })
        }
        // Still nothing: the model would invent products to fill the gap, so don't ask it.
        if (context.products.length === 0) {
          return { text: this._config.noMatchMessage ?? noMatchMessage(plan.filters), products: [] }
        }
      }
      // A business question with nothing to ground it would be answered from the model's
      // imagination (hours, policies), so say we don't know instead of calling it.
      if (plan.intent === 'knowledge' && context.knowledge.length === 0) {
        return { text: this._config.noInfoMessage ?? DEFAULT_NO_INFO, products: [] }
      }
      const answer = await this._answerer.answer(message, recent, context)
      const products = plan.intent === 'product'
        ? validateSelectedProducts(answer, context.products).slice(0, plan.requestedCount ?? context.products.length)
        : []
      if (plan.intent === 'product' && products.length === 0) {
        this._logger.warn('[Chat] answer selected no valid available products')
        return { text: this._config.noMatchMessage ?? noMatchMessage(plan.filters), products: [] }
      }
      // Product facts are rendered from canonical records, never from model text.
      const text = plan.intent === 'product' ? canonicalProductText(products, plan.requestedCount, answer.text) : answer.text
      if (leaksInstructions(text)) {
        this._logger.warn('[Chat] reply echoed its instructions; replaced')
        return { text: this._config.offTopicMessage ?? DEFAULT_OFF_TOPIC, products: [] }
      }
      return { text, products }
    } catch (error: any) {
      this._logger.error(`[Chat] reply failed: ${error.message}`)
      return { text: this._config.fallbackMessage ?? DEFAULT_FALLBACK, products: [] }
    }
  }
}
