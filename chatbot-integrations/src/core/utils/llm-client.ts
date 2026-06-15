import axios, { AxiosInstance } from 'axios'
import type { Logger } from './logger.js'

/**
 * LLM intent classifier (Llama 3 via Ollama) used as a *fallback* when Rasa's
 * own NLU is unsure. The classifier emits {intent, entities, confidence} which
 * the NLPClient turns into a Rasa intent-trigger payload like
 * `/book_appointment{"preferred_service":"Appointment Booking"}`.
 *
 * This module does NOT modify Rasa replies — there is no rewrite layer.
 */

export interface LlmClassifierConfig {
  /** Ollama base URL, e.g. http://localhost:11434 */
  ollamaUrl: string
  /** Ollama model tag, e.g. llama3 */
  model: string
  /** Upper bound for a single classification call in ms. */
  timeout?: number
  /** Model sampling temperature. Low values keep the JSON output deterministic. */
  temperature?: number
}

export interface LlmClassificationContext {
  /** Preferred language slot known from the tracker. */
  preferredLanguage?: string
  activeLoop?: string
  requestedSlot?: string
  /** Short conversation history, newest last. */
  history?: Array<{ role: 'user' | 'bot'; text: string }>
}

export interface LlmClassification {
  /** Rasa intent name. Always one of VALID_INTENTS (or 'nlu_fallback' on failure). */
  intent: string
  /** Rasa entities extracted from the user text. */
  entities: Record<string, string>
  /** Model-reported confidence in [0,1]. */
  confidence: number
  language: 'en' | 'ms' | 'zh'
  isInterruption: boolean
  isRefusal: boolean
  /** Raw JSON string returned by the model, for debugging. */
  raw: string
}

type LlmLanguage = LlmClassification['language']

/**
 * All intents Rasa knows about. Keep this in sync with calisto_nlp_export/domain.yml.
 * The LLM is instructed to pick exactly one of these (or return `nlu_fallback`).
 */
export const VALID_INTENTS = [
  'greet',
  'browse_eyewear',
  'ask_faq',
  'ask_pricing',
  'select_pricing_category',
  'select_product_type',
  'select_brand',
  'select_budget',
  'ask_lens_type',
  'lens_vision_solutions',
  'find_a_store',
  'store_hours',
  'choose_city',
  'search_product',
  'search_product_by_attribute',
  'product_recommendation',
  'inform_budget',
  'capture_lead',
  'share_name',
  'share_phone',
  'share_email',
  'share_location',
  'share_service_interest',
  'share_timeline',
  'book_appointment',
  'reschedule_appointment',
  'after_sales_support',
  'order_tracking',
  'warranty_claim',
  'human_handoff',
  'affirm',
  'deny',
  'nlu_fallback',
] as const

export type ValidIntent = (typeof VALID_INTENTS)[number]

/** Entity names Rasa understands. Matches the `entities:` block in domain.yml. */
export const VALID_ENTITIES = [
  'product_type',
  'brand',
  'price_range',
  'lens_type',
  'lens_feature',
  'lens_color',
  'lens_duration',
  'uv_protection',
  'polarized',
  'multifocal',
  'city',
  'use_case',
  'urgency',
  'order_id',
  'frame_color',
  'frame_shape',
  'frame_material',
  'gender',
  'budget',
  'lead_name',
  'contact_number',
  'email',
  'lead_location',
  'preferred_service',
  'purchase_timeline',
] as const

const INTENT_CATALOGUE = `
Intents (pick exactly one):
- greet: hello/hi/hey/salam/你好, opening pleasantries, no business request yet.
- browse_eyewear: wants to browse/see products without specifying a type yet.
- ask_faq: general question about Calisto, returns, shipping, eye care, brands etc.
- ask_pricing: asks about prices/how much without naming a category.
- select_pricing_category: picks a pricing category (frames, lenses, sunglasses, contacts).
- select_product_type: names a product category (frames/sunglasses/contacts/designer).
- select_brand: names a specific brand (RayBan, Gucci, Bossini, Bottega Veneta, Oakley, Persol etc.).
- select_budget: picks a budget bucket from a menu (Under RM100, RM100-RM250, etc.).
- ask_lens_type: picks/asks about a specific lens type (single vision, progressive, blue light, photochromic).
- lens_vision_solutions: general lens/vision consultation request.
- find_a_store: wants to find a store/branch/outlet.
- store_hours: asks opening hours / when a store is open.
- choose_city: names a Malaysian city for store lookup (Kuala Lumpur, Nilai, Penang, JB, Ipoh, etc.).
- search_product: free-form product search with one or more filters (shape, color, material, price, lens filters).
- search_product_by_attribute: searches by a single visual attribute (only shape, only color, only material).
- product_recommendation: asks what's best for a use-case or lens need (driving, office, sport, fashion, screen use).
- inform_budget: user states their budget as free text (e.g. "around RM200", "below 300").
- capture_lead: asks to be contacted / consult / talk to someone / leave my details.
- share_name: user volunteers their name when not inside a form.
- share_phone: user volunteers their phone number when not inside a form.
- share_email: user volunteers their email address when not inside a form.
- share_location: user volunteers their city when not inside a form.
- share_service_interest: user states which service they're interested in (eye test, fitting, consult).
- share_timeline: user states when they plan to buy/visit (this week, next month).
- book_appointment: explicitly wants to book an eye test, fitting, or store visit.
- reschedule_appointment: wants to move/cancel an existing appointment.
- after_sales_support: frame broken, lens scratched, needs repair / after-sales help.
- order_tracking: asks about an order / tracking / delivery status / ORD id.
- warranty_claim: mentions warranty, guarantee, claim, replace under warranty.
- human_handoff: asks for a human / agent / live person / real staff.
- affirm: yes/ok/sure/correct/betul/是的.
- deny: no/nope/cancel/tidak/不要.
- nlu_fallback: message is empty, nonsense, or does not map to any intent above.
`.trim()

const ENTITY_GUIDE = `
Entities (optional — include only when clearly stated by the user):
- product_type: "Designer Frames" | "Luxury Sunglasses" | "Contact Lenses" | "Frames"
    These are *product categories the customer can browse / buy*. "Contact
    Lenses" belongs HERE, not in lens_type. If the user says "contact lenses",
    "contacts", "kanta sentuh", "隐形眼镜" — that's product_type="Contact Lenses",
    intent=select_product_type.
- brand: canonical brand name (e.g. "RayBan", "Gucci", "Bossini", "Bottega Veneta", "Oakley", "Persol", "Calisto Vision")
    Normalize obvious typos only when deterministic: "guci" -> "Gucci", "ray ban" -> "RayBan", "botega veneta" -> "Bottega Veneta".
- price_range: one of "Under RM100" | "RM100-RM250" | "RM250-RM300" | "Above RM300"
- lens_type: "Single Vision" | "Progressive" | "Blue Light" | "Photochromic"
    These are *prescription-lens technologies fitted into spectacle frames*.
    NEVER put "Contact Lenses" here. Only the four values above are valid.
    If unsure between lens_type and product_type, prefer product_type.
- lens_feature: "Blue Light Filter" | "Photochromic"
- lens_color: lens tint or color if the user names one (e.g. "brown", "grey", "clear")
- lens_duration: lens wearing duration if explicitly stated (e.g. "daily", "monthly")
- uv_protection: "yes" when the user asks for UV blocking / sun protection.
- polarized: "yes" when the user asks for glare reduction / polarized lenses.
- multifocal: "yes" when the user asks for multifocal lenses.
- city: Malaysian city name in title case (e.g. "Kuala Lumpur", "Nilai", "Penang")
- use_case: free text like "driving", "office", "sport", "fashion"
- urgency: "today" | "this week" | "next week" | free text
- order_id: extract IDs like ORD12345
- frame_color / frame_shape / frame_material: single word each
- gender: "men" | "women" | "unisex"
- budget: numeric RM statement, e.g. "RM200", "around 300"
- lead_name / contact_number / email / lead_location / preferred_service / purchase_timeline:
  only set when the user is volunteering contact details or service interest outside a form.
`.trim()

const FEW_SHOT_EXAMPLES = `
Examples (these are authoritative — imitate them):
- "hi" -> {"intent":"greet","entities":{},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "Book Appointment" -> {"intent":"book_appointment","entities":{"preferred_service":"Appointment Booking"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "gotta reschedule my appointment" -> {"intent":"reschedule_appointment","entities":{},"confidence":0.85,"language":"en","is_interruption":true,"is_refusal":false}
- "i just wanna browse" -> {"intent":"browse_eyewear","entities":{},"confidence":0.85,"language":"en","is_interruption":true,"is_refusal":false}
- "show me ray-ban" -> {"intent":"select_brand","entities":{"brand":"RayBan"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "guci glasses pls" -> {"intent":"search_product","entities":{"product_type":"Designer Frames","brand":"Gucci"},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "i need botega veneta mens glasses" -> {"intent":"search_product","entities":{"product_type":"Designer Frames","brand":"Bottega Veneta","gender":"men"},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "i need bossini sunglasses" -> {"intent":"search_product","entities":{"product_type":"Luxury Sunglasses","brand":"Bossini"},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "i want to look into contact lenses" -> {"intent":"select_product_type","entities":{"product_type":"Contact Lenses"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "looking for designer frames" -> {"intent":"select_product_type","entities":{"product_type":"Designer Frames"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "any sun glasses?" -> {"intent":"select_product_type","entities":{"product_type":"Luxury Sunglasses"},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "need progressive lens" -> {"intent":"search_product","entities":{"lens_type":"Progressive"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "what is a progressive lens" -> {"intent":"ask_lens_type","entities":{"lens_type":"Progressive"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "i need blue light glasses" -> {"intent":"search_product","entities":{"lens_feature":"Blue Light Filter"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "i need polarized sunglasses with uv protection" -> {"intent":"search_product","entities":{"product_type":"Luxury Sunglasses","polarized":"yes","uv_protection":"yes"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "i need progressive lenses with blue light protection" -> {"intent":"search_product","entities":{"lens_type":"Progressive","lens_feature":"Blue Light Filter"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "i need multifocal glasses with uv protection" -> {"intent":"search_product","entities":{"multifocal":"yes","uv_protection":"yes"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "i need bifocal glasses" -> {"intent":"search_product","entities":{"lens_type":"Bifocal"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "recommend something for driving" -> {"intent":"product_recommendation","entities":{"use_case":"driving"},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "how much?" -> {"intent":"ask_pricing","entities":{},"confidence":0.8,"language":"en","is_interruption":false,"is_refusal":false}
- "my budget is around rm200" -> {"intent":"inform_budget","entities":{"budget":"RM200"},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "where's your store" -> {"intent":"find_a_store","entities":{},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "what time does KL store close" -> {"intent":"store_hours","entities":{"city":"Kuala Lumpur"},"confidence":0.9,"language":"en","is_interruption":true,"is_refusal":false}
- "ORD12345 status" -> {"intent":"order_tracking","entities":{"order_id":"ORD12345"},"confidence":0.95,"language":"en","is_interruption":false,"is_refusal":false}
- "my frame is broken pls help" -> {"intent":"after_sales_support","entities":{},"confidence":0.9,"language":"en","is_interruption":false,"is_refusal":false}
- "i need a real person" -> {"intent":"human_handoff","entities":{},"confidence":0.95,"language":"en","is_interruption":true,"is_refusal":false}
- "not comfortable sharing phone" -> {"intent":"deny","entities":{},"confidence":0.95,"language":"en","is_interruption":true,"is_refusal":true}
- "maybe later" -> {"intent":"deny","entities":{},"confidence":0.9,"language":"en","is_interruption":true,"is_refusal":true}
- "you already asked me twice" -> {"intent":"deny","entities":{},"confidence":0.85,"language":"en","is_interruption":true,"is_refusal":true}
- "saya nak tempah janji temu" -> {"intent":"book_appointment","entities":{"preferred_service":"Appointment Booking"},"confidence":0.9,"language":"ms","is_interruption":false,"is_refusal":false}
- "Saya mahu cermin mata Gucci murah" -> {"intent":"search_product","entities":{"product_type":"Designer Frames","brand":"Gucci","budget":"cheap"},"confidence":0.9,"language":"ms","is_interruption":false,"is_refusal":false}
- "saya nak kanta sentuh" -> {"intent":"select_product_type","entities":{"product_type":"Contact Lenses"},"confidence":0.9,"language":"ms","is_interruption":false,"is_refusal":false}
- "我要预约" -> {"intent":"book_appointment","entities":{"preferred_service":"Appointment Booking"},"confidence":0.95,"language":"zh","is_interruption":false,"is_refusal":false}
- "我要看隐形眼镜" -> {"intent":"select_product_type","entities":{"product_type":"Contact Lenses"},"confidence":0.95,"language":"zh","is_interruption":false,"is_refusal":false}
- "有没有太阳眼镜推荐" -> {"intent":"product_recommendation","entities":{"product_type":"Luxury Sunglasses"},"confidence":0.9,"language":"zh","is_interruption":false,"is_refusal":false}
- "banana spaceship quantum pizza" -> {"intent":"nlu_fallback","entities":{},"confidence":0.0,"language":"en","is_interruption":false,"is_refusal":false}
`.trim()

const SYSTEM_PROMPT = `
You are the fallback intent & entity classifier for "Calisto Eyewear", a
Malaysian eyewear retailer's chatbot. You are only called when Rasa's own NLU
could not classify the message confidently. You only classify — you do NOT
write replies.

${INTENT_CATALOGUE}

${ENTITY_GUIDE}

${FEW_SHOT_EXAMPLES}

Rules:
1. Output ONLY valid JSON matching this schema, nothing else:
   {"intent": string, "confidence": number, "language": "en|ms|zh", "entities": object, "is_interruption": boolean, "is_refusal": boolean}
2. "intent" MUST be exactly one of the intent names above.
3. "entities" is a flat object. Keys MUST be from the entities list above. Values
   are short strings. Omit the key if the entity is not clearly present.
4. "confidence" is a number between 0 and 1. Be generous: if the user's intent
   is obvious to a human, confidence should be >= 0.8, even if phrasing is
   informal ("wanna", "gonna", "plz", "u") or contains typos.
5. Support input in English, Malay (Bahasa Melayu), and Mandarin (Chinese).
   Informal contractions (wanna, gonna, gotta, u, ur, plz, pls, asap, lemme,
   kinda, sorta) are normal English — classify them just like their expanded
   form.
6. If the user message is empty, gibberish, or unrelated nonsense, return
   {"intent":"nlu_fallback","entities":{},"confidence":0.0,"language":"en","is_interruption":false,"is_refusal":false}.
7. Do not invent entity values that are not in the user message.
8. If active_loop is present and the user asks a different product/store/support/pricing question, set is_interruption=true.
9. If the user refuses contact details, wants to stop, says maybe later, or is uncomfortable sharing information, set is_refusal=true.
`.trim()

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    entities: { type: 'object', additionalProperties: { type: 'string' } },
    confidence: { type: 'number' },
    language: { type: 'string' },
    is_interruption: { type: 'boolean' },
    is_refusal: { type: 'boolean' },
  },
  required: ['intent', 'entities', 'confidence', 'language', 'is_interruption', 'is_refusal'],
} as const

function clampConfidence(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
  if (Number.isNaN(num)) {
    return 0
  }
  if (num < 0) return 0
  if (num > 1) return 1
  return num
}

function sanitizeEntities(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const allowed = new Set<string>(VALID_ENTITIES as readonly string[])
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      continue
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        out[key] = trimmed
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value)
    }
  }
  return out
}

function sanitizeIntent(raw: unknown): ValidIntent {
  if (typeof raw !== 'string') {
    return 'nlu_fallback'
  }
  const normalized = raw.trim() as ValidIntent
  return (VALID_INTENTS as readonly string[]).includes(normalized) ? normalized : 'nlu_fallback'
}

function sanitizeLanguage(raw: unknown): LlmLanguage {
  if (raw === 'en' || raw === 'ms' || raw === 'zh') {
    return raw
  }
  return 'en'
}

function sanitizeBoolean(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  if (typeof raw === 'number') return raw !== 0
  return false
}

/**
 * Build the Rasa intent-trigger payload that replaces raw user text when the
 * LLM classification succeeds. Rasa treats strings starting with `/intent_name`
 * as a direct intent trigger, skipping its own NLU stage.
 *
 * Example: `/book_appointment{"preferred_service":"Appointment Booking"}`
 */
export function buildRasaIntentPayload(classification: LlmClassification): string {
  const intent = classification.intent
  const entries = Object.entries(normalizeEntities(classification.entities))
  if (entries.length === 0) {
    return `/${intent}`
  }
  const entityJson = JSON.stringify(Object.fromEntries(entries))
  return `/${intent}${entityJson}`
}

const ENTITY_ALIASES: Record<string, Record<string, string>> = {
  lens_type: {
    'single vision': 'Single Vision Lenses',
    'single vision lens': 'Single Vision Lenses',
    'single vision lenses': 'Single Vision Lenses',
    progressive: 'Progressive Lenses',
    'progressive lens': 'Progressive Lenses',
    'progressive lenses': 'Progressive Lenses',
    'blue light': 'Blue Light Protection',
    'blue light lens': 'Blue Light Protection',
    'blue light lenses': 'Blue Light Protection',
    'blue light protection': 'Blue Light Protection',
    photochromic: 'Photochromic Lenses',
    'photochromic lens': 'Photochromic Lenses',
    'photochromic lenses': 'Photochromic Lenses',
  },
  lens_feature: {
    'blue light': 'Blue Light Filter',
    'anti blue light': 'Blue Light Filter',
    'screen protection': 'Blue Light Filter',
    'computer work': 'Blue Light Filter',
    'gaming glasses': 'Blue Light Filter',
    'office glasses': 'Blue Light Filter',
    photochromic: 'Photochromic',
    'transition lenses': 'Photochromic',
  },
  uv_protection: {
    yes: 'yes',
  },
  polarized: {
    yes: 'yes',
  },
  multifocal: {
    yes: 'yes',
  },
  product_type: {
    frame: 'Designer Frames',
    frames: 'Designer Frames',
    glasses: 'Designer Frames',
    spectacles: 'Designer Frames',
    eyeglasses: 'Designer Frames',
    'designer frame': 'Designer Frames',
    'designer frames': 'Designer Frames',
    sunglass: 'Luxury Sunglasses',
    sunglasses: 'Luxury Sunglasses',
    shades: 'Luxury Sunglasses',
    'luxury sunglasses': 'Luxury Sunglasses',
    contacts: 'Contact Lenses',
    'contact lens': 'Contact Lenses',
    'contact lenses': 'Contact Lenses',
  },
  brand: {
    acuvue: 'Acuvue',
    'bausch lomb': 'Bausch & Lomb',
    'bausch and lomb': 'Bausch & Lomb',
    'bausch & lomb': 'Bausch & Lomb',
    bossini: 'Bossini',
    bottega: 'Bottega Veneta',
    botega: 'Bottega Veneta',
    'bottega veneta': 'Bottega Veneta',
    'botega veneta': 'Bottega Veneta',
    burberry: 'Burberry',
    calisto: 'Calisto Vision',
    'calisto vision': 'Calisto Vision',
    cartier: 'Cartier',
    dior: 'Dior',
    'gentle monster': 'Gentle Monster',
    gucci: 'Gucci',
    guci: 'Gucci',
    oakley: 'Oakley',
    'oliver peoples': 'Oliver Peoples',
    persol: 'Persol',
    prada: 'Prada',
    projekt: 'Projekt Produkt',
    'projekt produkt': 'Projekt Produkt',
    rayban: 'RayBan',
    'ray ban': 'RayBan',
    saint: 'Saint Laurent',
    'saint laurent': 'Saint Laurent',
    'st laurent': 'Saint Laurent',
    ysl: 'Saint Laurent',
    'tom ford': 'Tom Ford',
    tomford: 'Tom Ford',
    versace: 'Versace',
  },
  gender: {
    men: 'men',
    mens: 'men',
    "men's": 'men',
    male: 'men',
    women: 'women',
    womens: 'women',
    "women's": 'women',
    female: 'women',
    unisex: 'unisex',
  },
  preferred_service: {
    'designer frame': 'Designer Frames',
    'designer frames': 'Designer Frames',
    sunglasses: 'Luxury Sunglasses',
    'luxury sunglasses': 'Luxury Sunglasses',
    lens: 'Lens Consultation',
    'lens consultation': 'Lens Consultation',
    'eyewear recommendation': 'Eyewear Recommendation',
    'store visit': 'Store Visit',
    'after sales': 'After-sales Support',
    'after sales support': 'After-sales Support',
  },
}

function normalizeEntityKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeEntities(entities: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(entities)) {
    const aliases = ENTITY_ALIASES[key]
    normalized[key] = aliases?.[normalizeEntityKey(value)] ?? value
  }
  return normalized
}

export class LlmIntentClassifier {
  private readonly _config: LlmClassifierConfig
  private readonly _logger: Logger
  private readonly _http: AxiosInstance

  constructor(config: LlmClassifierConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    this._http = axios.create({
      baseURL: config.ollamaUrl,
      timeout: config.timeout ?? 8_000,
    })
  }

  public get model(): string {
    return this._config.model
  }

  public get ollamaUrl(): string {
    return this._config.ollamaUrl
  }

  public async classify(
    userText: string,
    context: LlmClassificationContext = {},
  ): Promise<LlmClassification> {
    const trimmed = String(userText ?? '').trim()
    if (!trimmed) {
      return {
        intent: 'nlu_fallback',
        entities: {},
        confidence: 0,
        language: 'en',
        isInterruption: false,
        isRefusal: false,
        raw: '',
      }
    }

    const normalized = expandInformalEnglish(trimmed)

    const userPayload = {
      preferred_language: context.preferredLanguage ?? 'en',
      recent_history: (context.history ?? []).slice(-6),
      user_message: normalized,
      original_message: normalized === trimmed ? undefined : trimmed,
    }

    const body = {
      model: this._config.model,
      stream: false,
      format: CLASSIFICATION_SCHEMA,
      options: {
        temperature: this._config.temperature ?? 0.1,
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }

    const response = await this._http.post('/api/chat', body)
    const content: string = response.data?.message?.content ?? ''
    const rawJson = extractJson(content)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawJson)
    } catch (error: any) {
      this._logger.warn(`[LLM] Failed to parse model output as JSON: ${error.message}. raw="${content}"`)
      throw new Error(`LLM returned non-JSON output: ${content.slice(0, 200)}`)
    }

    const classification: LlmClassification = {
      intent: sanitizeIntent(parsed.intent),
      entities: sanitizeEntities(parsed.entities),
      confidence: clampConfidence(parsed.confidence),
      language: sanitizeLanguage(parsed.language),
      isInterruption: sanitizeBoolean(parsed.is_interruption),
      isRefusal: sanitizeBoolean(parsed.is_refusal),
      raw: rawJson,
    }

    this._logger.debug(
      `[LLM] intent=${classification.intent} confidence=${classification.confidence.toFixed(2)} entities=${JSON.stringify(classification.entities)}`,
    )

    return classification
  }

  public async healthCheck(): Promise<{ ok: boolean; status?: string }> {
    try {
      const response = await axios.get(`${this._config.ollamaUrl}/api/tags`, { timeout: 3_000 })
      const models: Array<{ name?: string }> = response.data?.models ?? []
      const hasModel = models.some((entry) => entry.name === this._config.model)
      return { ok: true, status: hasModel ? 'ready' : `model ${this._config.model} not pulled` }
    } catch {
      return { ok: false, status: 'unreachable' }
    }
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return '{}'
  }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return trimmed
  }
  return trimmed.slice(firstBrace, lastBrace + 1)
}

/**
 * Expand common English contractions and chat slang so the LLM sees phrasings
 * close to the few-shot examples. Runs BEFORE classification; the user never
 * sees the expanded form and Rasa never sees it either.
 *
 * Intentionally English-only — Malay and Mandarin are handled natively by the
 * LLM and don't need this normalization.
 */
function expandInformalEnglish(text: string): string {
  if (!/[a-zA-Z]/.test(text)) {
    return text
  }

  const replacements: Array<[RegExp, string]> = [
    [/\bwanna\b/gi, 'want to'],
    [/\bgonna\b/gi, 'going to'],
    [/\bgotta\b/gi, 'got to'],
    [/\blemme\b/gi, 'let me'],
    [/\bgimme\b/gi, 'give me'],
    [/\bdunno\b/gi, "don't know"],
    [/\bkinda\b/gi, 'kind of'],
    [/\bsorta\b/gi, 'sort of'],
    [/\bplz\b/gi, 'please'],
    [/\bpls\b/gi, 'please'],
    [/\bthx\b/gi, 'thanks'],
    [/\bty\b/gi, 'thanks'],
    [/\bur\b/gi, 'your'],
    [/\byr\b/gi, 'your'],
    [/\bu\b/gi, 'you'],
    [/\br\b/gi, 'are'],
    [/\byeh\b/gi, 'yes'],
    [/\byeah\b/gi, 'yes'],
    [/\byup\b/gi, 'yes'],
    [/\byep\b/gi, 'yes'],
    [/\bnah\b/gi, 'no'],
    [/\bnope\b/gi, 'no'],
  ]

  let out = text
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement)
  }
  return out.replace(/\s+/g, ' ').trim()
}
