import type { ContextExpansionResult, SessionContext } from './context-types.js'
import { ContextDetector, type ContextDetectionResult } from './context-detector.js'
import { SessionMemoryManager } from './session-memory.js'
import type { Logger } from '../utils/logger.js'

// Maps mirroring nlp-client.ts for entity extraction
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
  'blue': 'blue',
  'black': 'black',
  'brown': 'brown',
  'silver': 'silver',
  'gold': 'gold', 'golden': 'gold',
  'tortoise': 'tortoise', 'tortoiseshell': 'tortoise',
  'white': 'white', 'red': 'red', 'green': 'green', 'grey': 'grey', 'gray': 'grey',
}
const GENDER_MAP: Record<string, string> = {
  'men': 'men', 'mens': 'men', "men's": 'men', 'male': 'men', 'guys': 'men', 'boys': 'men',
  'women': 'women', 'womens': 'women', "women's": 'women', 'female': 'women', 'ladies': 'women', 'girls': 'women',
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
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const key of sorted) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return map[key]
    }
  }
  return null
}

function extractPriceModifier(text: string): string | null {
  if (/\b(cheaper|budget|affordable|cheap|less expensive)\b/i.test(text)) return 'cheaper'
  if (/\b(expensive|luxury)\b/i.test(text)) return 'expensive'
  if (/\b(premium|high end)\b/i.test(text)) return 'premium'
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
    if (val >= 50) result.budget_max = val
  }

  return Object.keys(result).length > 0 ? result : null
}

/**
 * Query Expander - Expands contextual references using session memory
 */
export class QueryExpander {
  private readonly _detector: ContextDetector
  private readonly _memory: SessionMemoryManager
  private readonly _logger: Logger

  constructor(memory: SessionMemoryManager, logger: Logger) {
    this._detector = new ContextDetector()
    this._memory = memory
    this._logger = logger
  }

  /**
   * Expand a query if it contains contextual references
   */
  public async expand(sessionId: string, query: string): Promise<ContextExpansionResult> {
    const detection = this._detector.detect(query)

    // No contextual reference found
    if (!detection.hasContext) {
      return {
        expanded: false,
        original_query: query,
        match_type: detection.matchType === 'comparison' ? 'no_match' : 'no_match',
      }
    }

    // Get session context
    const context = await this._memory.getContext(sessionId)
    if (!context || !context.current_interest) {
      this._logger.debug(`[Context] No session context found for ${sessionId}`)
      return {
        expanded: false,
        original_query: query,
        match_type: 'no_match',
      }
    }

    // Extract entities from current query
    const currentEntities = this._extractEntitiesFromQuery(query)

    // Perform Entity Merge
    // Rules: Current query always has priority. Redis should only fill missing values.
    const merged: Record<string, any> = {}
    const session = { ...context.current_interest }

    // Check if product type changed
    const oldProductType = session.product_type
    const newProductType = currentEntities.product_type || oldProductType

    // If product type changed (e.g. from Frames to Contact Lenses, or vice versa),
    // clear incompatible slots.
    if (newProductType && oldProductType && newProductType !== oldProductType) {
      if (newProductType === 'Contact Lenses') {
        session.frame_color = null
        session.frame_shape = null
        session.frame_material = null
        session.polarized = null
        session.uv_protection = null
      } else if (oldProductType === 'Contact Lenses') {
        session.lens_duration = null
      }
    }

    const allKeys = [
      'brand',
      'product_type',
      'frame_color',
      'frame_shape',
      'frame_material',
      'lens_type',
      'lens_feature',
      'polarized',
      'uv_protection',
      'multifocal',
      'gender',
      'budget_min',
      'budget_max',
      'budget_bucket',
      'price_range',
      'price_modifier',
    ]

    for (const key of allKeys) {
      if (currentEntities[key] !== undefined && currentEntities[key] !== null) {
        merged[key] = currentEntities[key]
      } else if (session[key] !== undefined && session[key] !== null) {
        merged[key] = session[key]
      } else {
        merged[key] = null
      }
    }

    // Check for variety/alternatives modifier
    if (/\b(similar|alternatives?|other|different|more options|another options?)\b/i.test(query)) {
      merged.allow_similar = true
    }

    // Filter out null / undefined values from payload
    const payload: Record<string, any> = {}
    for (const key of Object.keys(merged)) {
      if (merged[key] !== null && merged[key] !== undefined) {
        payload[key] = merged[key]
      }
    }

    if (Object.keys(payload).length > 0) {
      const payloadString = `/search_product${JSON.stringify(payload)}`
      this._logger.info(
        `[Context] Entity merged payload "${query}" → "${payloadString}" (session: ${sessionId})`,
      )
      return {
        expanded: true,
        original_query: query,
        expanded_query: payloadString,
        context_used: session,
        match_type: detection.matchType as any,
      }
    }

    return {
      expanded: false,
      original_query: query,
      match_type: 'no_match',
    }
  }

  /**
   * Update session context after NLP extracts entities
   */
  public async updateFromEntities(
    sessionId: string,
    entities: Record<string, string>,
    query: string,
  ): Promise<void> {
    const interest: Partial<SessionContext['current_interest']> = {}

    if (entities.brand) interest.brand = entities.brand
    if (entities.product_type) interest.product_type = entities.product_type
    if (entities.frame_color) interest.frame_color = entities.frame_color
    if (entities.frame_material) interest.frame_material = entities.frame_material
    if (entities.frame_shape) interest.frame_shape = entities.frame_shape
    if (entities.gender) interest.gender = entities.gender
    if (entities.lens_type) interest.lens_type = entities.lens_type
    if (entities.lens_feature) interest.lens_feature = entities.lens_feature
    if (entities.polarized) interest.polarized = entities.polarized
    if (entities.uv_protection) interest.uv_protection = entities.uv_protection
    if (entities.multifocal) interest.multifocal = entities.multifocal
    if (entities.price_range) interest.price_range = entities.price_range
    if (entities.price_modifier) interest.price_modifier = entities.price_modifier

    if (entities.budget_min) interest.budget_min = Number(entities.budget_min)
    if (entities.budget_max) interest.budget_max = Number(entities.budget_max)
    if (entities.budget_bucket) interest.budget_bucket = entities.budget_bucket

    // Build price range from budget if not present
    if (!interest.price_range && (entities.budget_min || entities.budget_max)) {
      const min = entities.budget_min || ''
      const max = entities.budget_max || ''
      interest.price_range = min && max ? `${min}-${max}` : min ? `above ${min}` : `under ${max}`
    }

    if (Object.keys(interest).length > 0) {
      await this._memory.updateContext(sessionId, interest, query)
      this._logger.debug(
        `[Context] Updated session ${sessionId}: ${JSON.stringify(interest)}`,
      )
    }
  }

  private _extractEntitiesFromQuery(query: string): Record<string, any> {
    const entities: Record<string, any> = {}
    const lower = query.toLowerCase()

    const brand = extractFromMap(lower, BRAND_ALIAS_MAP)
    if (brand) entities.brand = brand

    const shape = extractFromMap(lower, SHAPE_MAP)
    if (shape) entities.frame_shape = shape

    const material = extractFromMap(lower, MATERIAL_MAP)
    if (material) entities.frame_material = material

    const color = extractFromMap(lower, COLOR_MAP)
    if (color) entities.frame_color = color

    const gender = extractFromMap(lower, GENDER_MAP)
    if (gender) entities.gender = gender

    const priceModifier = extractPriceModifier(lower)
    if (priceModifier) entities.price_modifier = priceModifier

    const lensFilters = extractLensFilters(lower)
    Object.assign(entities, lensFilters)

    if (/contact/i.test(lower)) {
      entities.product_type = 'Contact Lenses'
    } else if (/sunglass|sun glass|shades/i.test(lower)) {
      entities.product_type = 'Luxury Sunglasses'
    } else if (/frame|glass|spectacle/i.test(lower)) {
      entities.product_type = 'Designer Frames'
    }

    const budget = parseBudget(lower)
    if (budget) {
      if (budget.budget_min !== undefined) entities.budget_min = budget.budget_min
      if (budget.budget_max !== undefined) entities.budget_max = budget.budget_max
      if (budget.budget_bucket !== undefined) entities.budget_bucket = budget.budget_bucket
    }

    return entities
  }
}
