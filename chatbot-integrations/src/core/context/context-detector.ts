/**
 * Context Detection - Identifies contextual references in user queries
 */

// Single-word contextual references
const SIMPLE_REFERENCES = [
  'that',
  'this',
  'it',
  'them',
  'those',
  'these',
  'earlier',
  'previous',
  'same',
]

// Multi-word contextual phrases
const PHRASE_REFERENCES = [
  'that one',
  'this one',
  'same one',
  'same product',
  'same brand',
  'the previous one',
  'the earlier one',
  'the product above',
  'the item above',
  'the one you showed',
  'the one you suggested',
  'the one before',
  'that product',
  'that item',
]

// Product modification keywords
const MODIFICATION_KEYWORDS = {
  color: ['blue', 'black', 'brown', 'silver', 'gold', 'white', 'red', 'green', 'grey', 'gray', 'tortoise'],
  quality: ['cheaper', 'premium', 'expensive', 'better', 'budget', 'luxury', 'affordable'],
  variety: ['similar', 'alternatives', 'other', 'different', 'more options', 'another option'],
}

// Accessory keywords
const ACCESSORY_KEYWORDS = [
  'lenses for',
  'case for',
  'cleaning kit for',
  'accessories for',
  'replacement parts for',
  'lens for',
  'cover for',
  'cleaner for',
]

// Comparison keywords (should route to NLP first)
const COMPARISON_KEYWORDS = [
  'compare',
  'is that better',
  'is that worth it',
  'which one is better',
  'which is better',
  'difference between',
]

export interface ContextDetectionResult {
  hasContext: boolean
  matchType: 'simple_reference' | 'product_modification' | 'accessory' | 'comparison' | 'none'
  modifiers?: {
    color?: string
    quality?: string
    variety?: string
  }
  accessoryType?: string
}

export class ContextDetector {
  /**
   * Detect if a query contains contextual references
   */
  public detect(query: string): ContextDetectionResult {
    const normalized = query.toLowerCase().trim()

    // Check for comparison queries (route to NLP)
    if (this._hasComparison(normalized)) {
      return {
        hasContext: false,
        matchType: 'comparison',
      }
    }

    // Check for accessory queries
    const accessoryType = this._detectAccessory(normalized)
    if (accessoryType) {
      return {
        hasContext: true,
        matchType: 'accessory',
        accessoryType,
      }
    }

    // Check for product modifications
    const modifiers = this._detectModifications(normalized)
    if (modifiers && (this._hasSimpleReference(normalized) || this._hasModificationReference(normalized))) {
      return {
        hasContext: true,
        matchType: 'product_modification',
        modifiers,
      }
    }

    // Check for simple references
    if (this._hasSimpleReference(normalized)) {
      return {
        hasContext: true,
        matchType: 'simple_reference',
      }
    }

    return {
      hasContext: false,
      matchType: 'none',
    }
  }

  private _hasSimpleReference(normalized: string): boolean {
    // Check phrase references first (longer matches)
    for (const phrase of PHRASE_REFERENCES) {
      if (normalized.includes(phrase)) {
        return true
      }
    }

    // Check single-word references (must be whole words)
    for (const word of SIMPLE_REFERENCES) {
      const regex = new RegExp(`\\b${word}\\b`, 'i')
      if (regex.test(normalized)) {
        return true
      }
    }

    return false
  }

  private _hasModificationReference(normalized: string): boolean {
    const patterns = [
      /\b(ones?|products?|items?|options?)\b/gi,
    ]
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return true
      }
    }
    return false
  }

  private _detectModifications(normalized: string): ContextDetectionResult['modifiers'] | null {
    const modifiers: ContextDetectionResult['modifiers'] = {}
    let hasModifier = false

    // Check color modifiers
    for (const color of MODIFICATION_KEYWORDS.color) {
      if (normalized.includes(color)) {
        modifiers.color = color
        hasModifier = true
        break
      }
    }

    // Check quality modifiers
    for (const quality of MODIFICATION_KEYWORDS.quality) {
      const regex = new RegExp(`\\b${quality}\\b`, 'i')
      if (regex.test(normalized)) {
        modifiers.quality = quality
        hasModifier = true
        break
      }
    }

    // Check variety modifiers
    for (const variety of MODIFICATION_KEYWORDS.variety) {
      if (normalized.includes(variety)) {
        modifiers.variety = variety
        hasModifier = true
        break
      }
    }

    return hasModifier ? modifiers : null
  }

  private _detectAccessory(normalized: string): string | null {
    for (const keyword of ACCESSORY_KEYWORDS) {
      if (normalized.includes(keyword)) {
        return keyword
      }
    }
    return null
  }

  private _hasComparison(normalized: string): boolean {
    return COMPARISON_KEYWORDS.some((keyword) => normalized.includes(keyword))
  }
}
