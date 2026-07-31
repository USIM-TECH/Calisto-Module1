/**
 * Types for Context-Aware Query Expansion
 */

export interface SessionContext {
  session_id: string
  current_interest: {
    brand?: string | null
    product_type?: string | null
    frame_color?: string | null
    frame_shape?: string | null
    frame_material?: string | null
    lens_type?: string | null
    lens_feature?: string | null
    polarized?: string | null
    uv_protection?: string | null
    multifocal?: string | null
    gender?: string | null
    budget_min?: number | null
    budget_max?: number | null
    budget_bucket?: string | null
    price_range?: string | null
    price_modifier?: string | null
    [key: string]: any
  }
  last_query: string
  updated_at: string
}

export interface ContextExpansionResult {
  expanded: boolean
  original_query: string
  expanded_query?: string
  context_used?: Partial<SessionContext['current_interest']>
  match_type?: 'simple_reference' | 'product_modification' | 'accessory' | 'no_match'
}
