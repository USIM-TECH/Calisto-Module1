import type { ProductStore } from '../../products/storage/product-store.interface.js'
import type { ProductRecord } from '../../products/types.js'
import type { Logger } from '../utils/index.js'
import { Answerer } from './answerer.js'
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
      this._logger.debug(`[Chat] intent=${plan.intent} filters=${JSON.stringify(plan.filters)}`)

      if (plan.intent === 'off_topic') {
        return { text: this._config.offTopicMessage ?? DEFAULT_OFF_TOPIC, products: [] }
      }
      if (plan.intent === 'chitchat' && recent.length === 0) {
        return { text: this._config.greetingMessage ?? DEFAULT_GREETING, products: [] }
      }

      let context = await this._retriever.retrieve(message, plan.intent === 'product' ? plan.filters : null)
      if (plan.intent === 'product' && context.products.length === 0) {
        // Over-narrow filters are the usual cause, so retry on type and brand alone.
        const { productType, brand } = plan.filters
        if (Object.keys(plan.filters).some((key) => key !== 'productType' && key !== 'brand')) {
          context = await this._retriever.retrieve(message, { productType, brand })
        }
        // Still nothing: the model would invent products to fill the gap, so don't ask it.
        if (context.products.length === 0) {
          return { text: this._config.noMatchMessage ?? DEFAULT_NO_MATCH, products: [] }
        }
      }
      // A business question with nothing to ground it would be answered from the model's
      // imagination (hours, policies), so say we don't know instead of calling it.
      if (plan.intent === 'knowledge' && context.knowledge.length === 0) {
        return { text: this._config.noInfoMessage ?? DEFAULT_NO_INFO, products: [] }
      }
      const text = await this._answerer.answer(message, recent, context)
      if (leaksInstructions(text)) {
        this._logger.warn('[Chat] reply echoed its instructions; replaced')
        return { text: this._config.offTopicMessage ?? DEFAULT_OFF_TOPIC, products: [] }
      }
      return { text, products: plan.intent === 'product' ? context.products : [] }
    } catch (error: any) {
      this._logger.error(`[Chat] reply failed: ${error.message}`)
      return { text: this._config.fallbackMessage ?? DEFAULT_FALLBACK, products: [] }
    }
  }
}
