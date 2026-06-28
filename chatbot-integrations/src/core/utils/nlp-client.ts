import axios from 'axios'
import type { Logger } from './logger.js'
import {
  buildRasaIntentPayload,
  LlmIntentClassifier,
  type LlmClassification,
} from './llm-client.js'
import { QueryExpander } from '../context/query-expander.js'
import { SessionMemoryManager } from '../context/session-memory.js'
import type { CacheService } from '../../cache/cache-service.js'


export interface NLPClientConfig {
  rasaUrl: string
  timeout?: number
  fallbackMessage?: string
  /**
   * If Rasa NLU returns an intent with confidence below this threshold (or the
   * intent is `nlu_fallback`), the message is rerouted through the LLM
   * fallback classifier. Defaults to 0.4 to match the Rasa pipeline's
   * `FallbackClassifier` threshold in `config.yml`.
   */
  nluConfidenceFloor?: number
  /**
   * If the LLM fallback classifier returns confidence below this threshold (or
   * intent `nlu_fallback`), the original raw text is forwarded to Rasa so its
   * own fallback rule fires (`utter_default`). Defaults to 0.35.
   */
  llmConfidenceFloor?: number
  isolateTrackersByChannel?: boolean
}

export interface NLPRequestMetadata {
  channel?: string
  senderName?: string
  sourceId?: string
  email?: string
  phone?: string
  location?: string
}

export interface NLPResponse {
  text: string
  raw: Array<{ text?: string; image?: string; buttons?: any[]; custom?: Record<string, unknown> }>
  tracker?: {
    latestIntent?: string
    latestMessageText?: string
    activeLoop?: string
    slots: Record<string, unknown>
  }
  /** Set when the LLM fallback was invoked for this turn. */
  llm?: {
    intent: string
    confidence: number
    entities: Record<string, string>
    payload: string
  }
}

const DEFAULT_FALLBACK = 'Sorry, something went wrong. Please try again.'
const DEFAULT_NLU_FLOOR = 0.4
const DEFAULT_LLM_FLOOR = 0.35

interface RasaParseResult {
  intent: string
  confidence: number
  entities?: Record<string, string>
}

const SUPPORT_KEYWORDS = [
  'return',
  'refund',
  'exchange',
  'repair',
  'warranty',
  'broken',
  'damaged',
  'cracked',
  'replacement',
  'replace',
  'send back',
  'cancel order',
  'money back',
  'defect',
  'issue',
  'support',
]

const SHOPPING_SIGNAL_KEYWORDS = [
  'buy',
  'price',
  'cost',
  'cheap',
  'under',
  'below',
  'rm',
  'show me',
  'sunglasses',
  'sun glasses',
  'shades',
  'glasses',
  'eyeglasses',
  'spectacles',
  'frames',
  'frame',
  'contacts',
  'contact lenses',
  'lenses',
  'find',
  'looking for',
  'i want',
  'need',
  'daily',
  'office',
  // shape
  'round', 'square', 'rectangle', 'rectangular', 'aviator', 'cat-eye', 'cat eye', 'oval',
  // material
  'metal', 'titanium', 'acetate', 'rimless', 'plastic',
  // color
  'black', 'brown', 'silver', 'gold', 'tortoise',
  // gender
  'mens', 'womens', 'male', 'female', 'unisex',
  // other
  'blue light',
  'progressive',
  'bifocal',
  'multifocal',
  'polarized',
  'polarised',
  'uv protection',
  'photochromic',
]

// Unit-test style routing examples:
// - "return my glasses" -> support_keyword_detected: true, route: raw
// - "refund my sunglasses" -> support_keyword_detected: true, route: raw
// - "repair broken frames" -> support_keyword_detected: true, route: raw
// - "exchange contact lenses" -> support_keyword_detected: true, route: raw
// - "cheap gucci glasses" -> support_keyword_detected: false, route: opportunistic
// - "sunglasses under 1000rm" -> support_keyword_detected: false, route: opportunistic

function parseBudget(text: string): { budget_min?: number; budget_max?: number; budget_bucket?: string } | null {
  const normalized = text.toLowerCase().replace(/rm/g, '').replace(/\s+/g, ' ').trim()
  const budgetIntentText = normalized
    .replace(/\bluxury\s+sunglasses?\b/g, 'sunglasses')
    .replace(/\bpremium\s+sunglasses?\b/g, 'sunglasses')
  const result: { budget_min?: number; budget_max?: number; budget_bucket?: string } = {}

  if (/cheap|affordable|budget|low\s+price/i.test(budgetIntentText)) {
    result.budget_bucket = 'low'
  } else if (/premium|luxury|expensive|high\s+end/i.test(budgetIntentText)) {
    result.budget_bucket = 'premium'
  }

  let match
  if ((match = normalized.match(/(?:between|from)?\s*(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*(\d+(?:\.\d+)?)/))) {
    result.budget_min = parseFloat(match[1])
    result.budget_max = parseFloat(match[2])
  } else if ((match = normalized.match(/(?:under|below|less than|<)\s*(\d+(?:\.\d+)?)/))) {
    result.budget_max = parseFloat(match[1])
  } else if ((match = normalized.match(/(?:over|above|more than|>)\s*(\d+(?:\.\d+)?)/))) {
    result.budget_min = parseFloat(match[1])
  } else if ((match = normalized.match(/(?:around|about|approx(?:imately)?)\s*(\d+(?:\.\d+)?)/))) {
    const val = parseFloat(match[1])
    result.budget_min = val - 50
    result.budget_max = val + 50
  } else if ((match = normalized.match(/\b(\d+(?:\.\d+)?)\b/))) {
    const val = parseFloat(match[1])
    result.budget_max = val
  }

  return Object.keys(result).length > 0 ? result : null
}

function detectSupportKeyword(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  return SUPPORT_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function hasShoppingSignal(text: string, hasBudget: boolean): boolean {
  if (hasBudget) return true
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  return SHOPPING_SIGNAL_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function buildLeadFormPrompt(requestedSlot: string | undefined, preferredLanguage: string | undefined): string {
  const lang = (preferredLanguage || '').toLowerCase()
  switch (requestedSlot) {
    case 'lead_name':
      return lang === 'ms'
        ? 'Boleh saya tahu nama anda dahulu?'
        : lang === 'zh'
          ? '可以先告诉我您的名字吗？'
          : 'First, may I have your name?'
    case 'contact_number':
      return lang === 'ms'
        ? 'Apakah nombor WhatsApp atau telefon terbaik untuk pasukan kami hubungi anda?'
        : lang === 'zh'
          ? '请问您的 WhatsApp 或联系电话是什么，方便团队联系您？'
          : 'What is the best WhatsApp or phone number for our team to reach you on?'
    case 'email':
      return lang === 'ms'
        ? 'Apakah alamat e-mel yang patut kami gunakan untuk sebut harga atau susulan?'
        : lang === 'zh'
          ? '请问我们应该使用哪个邮箱给您发送报价或后续联系？'
          : 'What email address should we use for quotations or follow-up?'
    case 'lead_location':
      return lang === 'ms'
        ? 'Anda berada di kawasan atau bandar mana supaya kami boleh arahkan anda ke pasukan atau kedai yang betul?'
        : lang === 'zh'
          ? '请问您所在的区域或城市是哪里？这样我们可以安排合适的团队或门店跟进您。'
          : 'Which area or city are you located in, so we can route you to the right team or store?'
    case 'preferred_service':
      return lang === 'ms'
        ? 'Apakah yang paling anda minati hari ini?'
        : lang === 'zh'
          ? '您今天主要想了解什么？'
          : 'What are you mainly interested in today?'
    case 'purchase_timeline':
      return lang === 'ms'
        ? 'Anda merancang untuk membuat keputusan atau melawat kedai dalam tempoh bila?'
        : lang === 'zh'
          ? '您打算多久内做决定或到门店看看？'
          : 'When are you planning to decide or visit a store?'
    default:
      return ''
  }
}

// Deterministic attribute maps — values must match CSV column values exactly (lowercase).
const SHAPE_MAP: Record<string, string> = {
  'round': 'round', 'circular': 'round',
  'square': 'square', 'square shaped': 'square',
  'rectangle': 'rectangle', 'rectangular': 'rectangle',
  'aviator': 'aviator', 'aviators': 'aviator',
  'cat-eye': 'cat-eye', 'cat eye': 'cat-eye', 'cateye': 'cat-eye',
  'oval': 'oval',
}
const MATERIAL_MAP: Record<string, string> = {
  'metal': 'metal', 'metallic': 'metal',
  'titanium': 'titanium',
  'acetate': 'acetate', 'plastic': 'acetate',
  'rimless': 'rimless',
}
const COLOR_MAP: Record<string, string> = {
  'black': 'black',
  'brown': 'brown',
  'silver': 'silver',
  'gold': 'gold', 'golden': 'gold',
  'tortoise': 'tortoise', 'tortoiseshell': 'tortoise',
}
const GENDER_MAP: Record<string, string> = {
  'men': 'men', 'mens': 'men', "men's": 'men', 'male': 'men', 'guys': 'men',
  'women': 'women', 'womens': 'women', "women's": 'women', 'female': 'women', 'ladies': 'women',
  'unisex': 'unisex',
}
const BRAND_ALIAS_MAP: Record<string, string> = {
  'acuvue': 'Acuvue',
  'bausch & lomb': 'Bausch & Lomb',
  'bausch and lomb': 'Bausch & Lomb',
  'bausch lomb': 'Bausch & Lomb',
  'bossini': 'Bossini',
  'bottega veneta': 'Bottega Veneta',
  'botega veneta': 'Bottega Veneta',
  'bottega': 'Bottega Veneta',
  'botega': 'Bottega Veneta',
  'burberry': 'Burberry',
  'calisto vision': 'Calisto Vision',
  'calisto': 'Calisto Vision',
  'cartier': 'Cartier',
  'dior': 'Dior',
  'gentle monster': 'Gentle Monster',
  'gucci': 'Gucci',
  'guci': 'Gucci',
  'oakley': 'Oakley',
  'oliver peoples': 'Oliver Peoples',
  'persol': 'Persol',
  'prada': 'Prada',
  'projekt produkt': 'Projekt Produkt',
  'projekt': 'Projekt Produkt',
  'ray-ban': 'RayBan',
  'ray ban': 'RayBan',
  'rayban': 'RayBan',
  'saint laurent': 'Saint Laurent',
  'st laurent': 'Saint Laurent',
  'ysl': 'Saint Laurent',
  'tom ford': 'Tom Ford',
  'tomford': 'Tom Ford',
  'versace': 'Versace',
  'raymond': 'Raymond',
}

function extractFromMap(text: string, map: Record<string, string>): string | null {
  // Try longest keys first to match multi-word entries like "cat eye" before "cat"
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const key of sorted) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return map[key]
    }
  }
  return null
}

function extractLensFilters(text: string): Record<string, string> {
  const entities: Record<string, string> = {}
  const normalized = text.toLowerCase()

  if (/\b(blue light|anti blue light|screen protection|computer work|screen time|gaming glasses|office glasses|digital screens?)\b/i.test(normalized)) {
    entities.lens_feature = 'Blue Light Filter'
  }
  if (/\b(progressive|reading and distance|age related vision correction)\b/i.test(normalized)) {
    entities.lens_type = 'Progressive'
  }
  if (/\b(bifocal|near and far vision)\b/i.test(normalized)) {
    entities.lens_type = 'Bifocal'
  }
  if (/\b(multifocal)\b/i.test(normalized)) {
    entities.multifocal = 'yes'
  }
  if (/\b(polarized|polarised|glare reduction|driving sunglasses?)\b/i.test(normalized)) {
    entities.polarized = 'yes'
  }
  if (/\b(uv protection|uv blocking|sun protection|sunlight|protect eyes from sunlight)\b/i.test(normalized)) {
    entities.uv_protection = 'yes'
  }
  if (/\b(transition lenses?|photochromic|darken outdoors?)\b/i.test(normalized)) {
    entities.lens_feature = 'Photochromic'
  }

  return entities
}

function opportunisticSlotFilling(text: string): string | null {
  const entities: Record<string, any> = {}
  const budget = parseBudget(text)
  if (budget) {
    Object.assign(entities, budget)
  }
  
  const lower = text.toLowerCase()
  const brand = extractFromMap(lower, BRAND_ALIAS_MAP)
  if (brand) entities.brand = brand
  
  // Extract deterministic attributes — shape, material, color, gender
  const shape = extractFromMap(lower, SHAPE_MAP)
  if (shape) entities.frame_shape = shape

  const material = extractFromMap(lower, MATERIAL_MAP)
  if (material) entities.frame_material = material

  const color = extractFromMap(lower, COLOR_MAP)
  if (color) entities.frame_color = color

  const gender = extractFromMap(lower, GENDER_MAP)
  if (gender) entities.gender = gender

  Object.assign(entities, extractLensFilters(lower))

  if (/sunglass|sun glass|shades/i.test(lower)) {
    entities.product_type = 'Luxury Sunglasses'
  } else if (/frame|glass|spectacle/i.test(lower)) {
    entities.product_type = 'Designer Frames'
  } else if (/contact/i.test(lower)) {
    entities.product_type = 'Contact Lenses'
  }

  const hasLensSignal = Boolean(
    entities.lens_type
    || entities.lens_feature
    || entities.uv_protection
    || entities.polarized
    || entities.multifocal
  )
  const hasAttributeSignal = Boolean(shape || material || color || gender || hasLensSignal)
  const hasSearchDetail = Boolean(
    (entities.brand && (entities.product_type || hasAttributeSignal || budget))
    || (entities.product_type && (hasAttributeSignal || budget))
    || hasAttributeSignal
  )
  if (entities.product_type && Object.keys(entities).length === 1 && hasShoppingSignal(text, false)) {
    return `/search_product${JSON.stringify({ product_type: entities.product_type })}`
  }

  const allowOpportunistic = hasSearchDetail
    && hasShoppingSignal(text, Boolean(budget))

  if (Object.keys(entities).length > 0 && allowOpportunistic) {
    // Default product_type only for frame-style searches; lens-only requests should stay broad.
    if (!entities.product_type && hasAttributeSignal && !hasLensSignal) {
      entities.product_type = 'Designer Frames'
    }
    return `/search_product${JSON.stringify(entities)}`
  }
  if (budget && Object.keys(entities).length === Object.keys(budget).length) {
    return `/inform_budget${JSON.stringify(entities)}`
  }
  return null
}


export class NLPClient {
  private _config: NLPClientConfig
  private _logger: Logger
  private _llm?: LlmIntentClassifier
  private _queryExpander?: QueryExpander

  constructor(
    config: NLPClientConfig,
    logger: Logger,
    llm?: LlmIntentClassifier,
    cacheService?: CacheService,
  ) {
    this._config = config
    this._logger = logger
    this._llm = llm
    
    if (cacheService) {
      const sessionMemory = new SessionMemoryManager(cacheService)
      this._queryExpander = new QueryExpander(sessionMemory, logger)
    }
  }

  public get llmEnabled(): boolean {
    return Boolean(this._llm)
  }

  /**
   * Send a user message to Rasa.
   *
   * Flow:
   *   1. If the conversation is inside an active form, or the message is
   *      already an intent-trigger payload (`/intent_name`), forward it raw.
   *   2. Otherwise, call Rasa's `/model/parse` to see what its NLU thinks.
   *   3. If Rasa is confident (intent != `nlu_fallback` and confidence >=
   *      `nluConfidenceFloor`), forward the raw text — Rasa will re-parse and
   *      run its rules normally.
   *   4. If Rasa is *not* confident, ask the LLM (Llama 3 via Ollama) to
   *      classify. If the LLM is confident (intent != `nlu_fallback` and
   *      confidence >= `llmConfidenceFloor`), send the resulting
   *      `/intent{...}` payload to Rasa so it can run the rule the user
   *      actually wanted.
   *   5. If the LLM is also unsure, forward the raw text and let Rasa's own
   *      `FallbackClassifier` + `action_default_fallback` produce the
   *      user-facing fallback message.
   */
  public async getResponse(userId: string, message: string, metadata?: NLPRequestMetadata): Promise<NLPResponse> {
    const startedAt = Date.now()
    const rasaUrl = this._config.rasaUrl
    const timeout = this._config.timeout ?? 10_000
    const fallback = this._config.fallbackMessage ?? DEFAULT_FALLBACK
    const nluFloor = this._config.nluConfidenceFloor ?? DEFAULT_NLU_FLOOR
    const llmFloor = this._config.llmConfidenceFloor ?? DEFAULT_LLM_FLOOR

    let safeMessage = String(message).slice(0, 1000).trim()
    const senderNamespace = this._config.isolateTrackersByChannel && metadata?.channel
      ? `${metadata.channel}:${userId}`
      : userId
    const safeSender = String(senderNamespace).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 80)

    if (!safeMessage) {
      return { text: fallback, raw: [] }
    }

    // Context-Aware Query Expansion Layer
    if (this._queryExpander && !safeMessage.startsWith('/')) {
      const expansion = await this._queryExpander.expand(safeSender, safeMessage)
      if (expansion.expanded && expansion.expanded_query) {
        this._logger.info(
          `[Context] Query expansion applied: "${safeMessage}" → "${expansion.expanded_query}"`,
        )
        safeMessage = expansion.expanded_query
      }
    }

    const preTracker = await this.getTracker(safeSender)
    const isInsideForm = Boolean(preTracker?.activeLoop)
    const preferredLanguage = typeof preTracker?.slots.preferred_language === 'string'
      ? preTracker.slots.preferred_language as string
      : undefined

    let llmResult: LlmClassification | undefined
    let rasaMessage = safeMessage
    let route: 'raw' | 'llm-trigger' | 'fallback-raw' | 'skip' | 'opportunistic' = 'raw'
    let supportKeywordDetected = false
    let opportunisticBlocked = false

    if (safeMessage.startsWith('/')) {
      route = 'skip'
    } else {
      supportKeywordDetected = detectSupportKeyword(safeMessage)
      opportunisticBlocked = supportKeywordDetected

      if (supportKeywordDetected) {
        this._logger.info(JSON.stringify({
          message: safeMessage,
          support_keyword_detected: true,
          opportunistic_blocked: true,
          route: 'raw',
        }))
        route = 'raw'
      } else {
        const opportunisticPayload = !isInsideForm ? opportunisticSlotFilling(safeMessage) : null

        if (opportunisticPayload) {
          rasaMessage = opportunisticPayload
          route = 'opportunistic'
          this._logger.info(`[NLU] Deterministic opportunistic extraction -> ${rasaMessage}`)
        } else if (isInsideForm) {
          // When the form is requesting a phone number, bare digit strings
          // (e.g. "9876543210") can be misclassified by Rasa as `inform_budget`
          // which is in the form's ignored_intents — causing the form to reject
          // and return an empty response.  Intercept them here and send a
          // properly structured intent payload so Rasa fills the slot correctly.
          const requestedSlot = preTracker?.slots?.requested_slot
          if (
            requestedSlot === 'lead_name'
            && isValidLeadName(safeMessage)
          ) {
            const normalizedName = safeMessage.replace(/\s+/g, ' ').trim()
            rasaMessage = `/share_name{"lead_name":"${normalizedName.replace(/"/g, '\\"')}"}`
            this._logger.debug(
              `[NLU] Converted bare name input to intent payload for form slot: ${rasaMessage}`,
            )
          }
          if (
            requestedSlot === 'contact_number'
            && /^\+?[\d\s\-\(\)]{8,20}$/.test(safeMessage)
          ) {
            const normalizedPhone = safeMessage.replace(/[^\d+]/g, '')
            rasaMessage = `/share_phone{"contact_number": "${normalizedPhone}"}`
            this._logger.debug(
              `[NLU] Converted bare phone input to intent payload for form slot: ${rasaMessage}`,
            )
          }
          route = 'skip'
        } else {
          const parseResult = await this._parseWithRasa(safeMessage)

          if (parseResult && parseResult.intent !== 'nlu_fallback' && parseResult.confidence >= nluFloor) {
            this._logger.debug(
              `[NLU] Rasa classified "${truncateForLog(safeMessage)}" as ${parseResult.intent} ` +
              `(confidence=${parseResult.confidence.toFixed(2)}) — forwarding raw text`,
            )
            route = 'raw'
          } else if (this._llm) {
            const reason = parseResult
              ? `${parseResult.intent}@${parseResult.confidence.toFixed(2)}`
              : 'parse-failed'
            this._logger.info(
              `[NLU] Rasa unsure (${reason}) for "${truncateForLog(safeMessage)}" — invoking LLM fallback`,
            )

            try {
              llmResult = await this._llm.classify(safeMessage, { preferredLanguage })

              if (
                llmResult.intent !== 'nlu_fallback'
                && llmResult.confidence >= llmFloor
              ) {
                rasaMessage = buildRasaIntentPayload(llmResult)
                route = 'llm-trigger'
                this._logger.info(
                  `[LLM] Routed "${truncateForLog(safeMessage)}" -> ${rasaMessage} ` +
                  `(confidence=${llmResult.confidence.toFixed(2)})`,
                )
              } else {
                route = 'fallback-raw'
                this._logger.info(
                  `[LLM] Low confidence (${llmResult.confidence.toFixed(2)}) for ` +
                  `"${truncateForLog(safeMessage)}" — letting Rasa fallback fire`,
                )
              }
            } catch (error: any) {
              this._logger.error(`[LLM] Classification failed, letting Rasa fallback fire: ${error.message}`)
              route = 'fallback-raw'
            }
          } else {
            this._logger.debug(
              `[NLU] Rasa unsure and LLM disabled — letting Rasa fallback fire for "${truncateForLog(safeMessage)}"`,
            )
            route = 'fallback-raw'
          }
        }
      }
    }

    try {
      this._logger.debug(`[NLP] Sending to Rasa: sender="${safeSender}", message="${truncateForLog(rasaMessage)}", route=${route}`)

      const response = await axios.post(
        `${rasaUrl}/webhooks/rest/webhook`,
        { sender: safeSender, message: rasaMessage, metadata },
        { timeout }
      )

      const rawReplies: Array<{ text?: string; image?: string; buttons?: any[]; custom?: Record<string, unknown> }> = response.data

      if (!Array.isArray(rawReplies) || rawReplies.length === 0) {
        const postTracker = await this.getTracker(safeSender)

        // An empty response during an active form is a known Rasa behaviour:
        // the form accepted the slot value and is silently advancing to the
        // next slot.  If we know which slot is being requested, surface the
        // next prompt instead of returning silence.
        if (isInsideForm && postTracker?.activeLoop) {
          const requestedSlot = typeof postTracker.slots?.requested_slot === 'string'
            ? postTracker.slots.requested_slot
            : undefined
          const prompt = buildLeadFormPrompt(requestedSlot, preferredLanguage)
          if (prompt) {
            this._logger.debug(
              `[NLP] Rasa returned empty response during active form — synthesizing prompt for ${requestedSlot}`,
            )
            return {
              text: prompt,
              raw: [{ text: prompt }],
              tracker: postTracker,
              llm: llmResult ? this._serializeLlm(llmResult, rasaMessage) : undefined,
            }
          }
          this._logger.debug(
            '[NLP] Rasa returned empty response during active form — suppressing fallback (slot transition)',
          )
          return {
            text: '',
            raw: [],
            tracker: postTracker,
            llm: llmResult ? this._serializeLlm(llmResult, rasaMessage) : undefined,
          }
        }

        this._logger.warn('[NLP] Rasa returned empty response')
        return {
          text: fallback,
          raw: [],
          tracker: postTracker,
          llm: llmResult ? this._serializeLlm(llmResult, rasaMessage) : undefined,
        }
      }

      const postTracker = await this.getTracker(safeSender)
      const combinedText = rawReplies
        .map((r) => r.text)
        .filter(Boolean)
        .join('\n\n')

      this._logger.debug(`[NLP] Rasa response: ${combinedText.substring(0, 200)}...`)
      this._logger.info(JSON.stringify({
        event: 'nlp_turn',
        channel: metadata?.channel,
        sender_id: redactIdentifier(safeSender),
        route,
        intent: postTracker?.latestIntent,
        support_keyword_detected: supportKeywordDetected,
        opportunistic_blocked: opportunisticBlocked,
        llm_used: Boolean(llmResult),
        latency_ms: Date.now() - startedAt,
      }))

      // Update session context from extracted entities
      if (this._queryExpander && postTracker?.slots) {
        const entities: Record<string, string> = {}
        const slots = postTracker.slots
        
        if (typeof slots.brand === 'string') entities.brand = slots.brand
        if (typeof slots.product_type === 'string') entities.product_type = slots.product_type
        if (typeof slots.frame_color === 'string') entities.frame_color = slots.frame_color
        if (typeof slots.frame_material === 'string') entities.frame_material = slots.frame_material
        if (typeof slots.frame_shape === 'string') entities.frame_shape = slots.frame_shape
        if (typeof slots.gender === 'string') entities.gender = slots.gender
        if (typeof slots.budget_min === 'number') entities.budget_min = String(slots.budget_min)
        if (typeof slots.budget_max === 'number') entities.budget_max = String(slots.budget_max)
        
        if (Object.keys(entities).length > 0) {
          await this._queryExpander.updateFromEntities(safeSender, entities, safeMessage)
        }
      }

      return {
        text: combinedText || fallback,
        raw: rawReplies,
        tracker: postTracker,
        llm: llmResult ? this._serializeLlm(llmResult, rasaMessage) : undefined,
      }
    } catch (error: any) {
      this._logger.error(`[NLP] Rasa error: ${describeAxiosError(error, `${rasaUrl}/webhooks/rest/webhook`)}`)
      this._logger.info(JSON.stringify({
        event: 'nlp_turn',
        channel: metadata?.channel,
        sender_id: redactIdentifier(safeSender),
        route,
        llm_used: Boolean(llmResult),
        latency_ms: Date.now() - startedAt,
        status: 'error',
      }))
      return { text: fallback, raw: [] }
    }
  }

  /**
   * Hit Rasa's `/model/parse` to inspect what its NLU thinks of the message
   * without producing a reply. Returns `undefined` on transport errors so the
   * caller can decide whether to fall back to the LLM.
   */
  private async _parseWithRasa(text: string): Promise<RasaParseResult | undefined> {
    const url = `${this._config.rasaUrl}/model/parse`
    try {
      const response = await axios.post(url, { text }, { timeout: 5_000 })
      const intent = response.data?.intent
      if (!intent || typeof intent.name !== 'string') {
        return undefined
      }
      const confidence = typeof intent.confidence === 'number' ? intent.confidence : 0
      return { intent: intent.name, confidence }
    } catch (error: any) {
      this._logger.warn(`[NLU] /model/parse failed: ${describeAxiosError(error, url)}`)
      return undefined
    }
  }

  public async getTracker(userId: string): Promise<NLPResponse['tracker']> {
    const url = `${this._config.rasaUrl}/conversations/${encodeURIComponent(userId)}/tracker`
    try {
      const response = await axios.get(url, {
        params: { include_events: 'NONE' },
        timeout: 5000,
      })

      const slots = response.data?.slots && typeof response.data.slots === 'object'
        ? response.data.slots as Record<string, unknown>
        : {}
      const latestIntent = response.data?.latest_message?.intent?.name
      const latestMessageText = typeof response.data?.latest_message?.text === 'string'
        ? response.data.latest_message.text as string
        : undefined
      const activeLoopRaw = response.data?.active_loop
      const activeLoop = typeof activeLoopRaw === 'string'
        ? activeLoopRaw
        : (activeLoopRaw && typeof activeLoopRaw === 'object' && typeof activeLoopRaw.name === 'string')
          ? activeLoopRaw.name as string
          : undefined

      return { latestIntent, latestMessageText, activeLoop, slots }
    } catch (error: any) {
      this._logger.warn(`[NLP] Failed to fetch tracker for ${userId}: ${describeAxiosError(error, url)}`)
      return undefined
    }
  }


  public async healthCheck(): Promise<{
    ok: boolean
    status?: string
    llm?: { ok: boolean; status?: string }
  }> {
    const llmHealth = this._llm ? await this._llm.healthCheck() : undefined
    try {
      const response = await axios.get(`${this._config.rasaUrl}/health`, { timeout: 3000 })
      return { ok: true, status: response.data?.status ?? 'ok', llm: llmHealth }
    } catch {
      return { ok: false, status: 'unreachable', llm: llmHealth }
    }
  }

  private _serializeLlm(classification: LlmClassification, payload: string): NonNullable<NLPResponse['llm']> {
    return {
      intent: classification.intent,
      confidence: classification.confidence,
      entities: classification.entities,
      payload,
    }
  }
}

function isValidLeadName(value: string): boolean {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  if (normalized.length < 2 || normalized.length > 60) return false
  if (/[@\d?!]/.test(normalized)) return false
  const lowered = normalized.toLowerCase()
  const disallowed = [
    'hi',
    'hello',
    'hey',
    'glasses',
    'frames',
    'sunglasses',
    'lenses',
    'price',
    'pricing',
    'store',
    'appointment',
  ]
  if (disallowed.some((token) => lowered === token || lowered.includes(` ${token}`) || lowered.startsWith(`${token} `))) {
    return false
  }
  return /^[A-Za-z][A-Za-z .'\-]{1,59}$/.test(normalized)
}

function truncateForLog(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value
}

function redactIdentifier(value: string): string {
  if (value.length <= 6) {
    return '***'
  }
  return `${value.slice(0, 3)}...${value.slice(-3)}`
}

/**
 * Axios throws errors whose `.message` is often empty or generic ("Request failed with status code 500").
 * Build a human-readable string that captures the HTTP status, URL, and error
 * code (ECONNREFUSED, ETIMEDOUT, etc.) so blank log lines never happen.
 */
function describeAxiosError(error: any, url: string): string {
  const parts: string[] = []
  if (error?.code) parts.push(`code=${error.code}`)
  if (error?.response?.status) parts.push(`status=${error.response.status}`)
  parts.push(`url=${url}`)
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : (error?.code === 'ECONNREFUSED' ? 'connection refused (Rasa is not running)' : 'unknown error')
  parts.push(`msg="${message}"`)
  return parts.join(' ')
}
