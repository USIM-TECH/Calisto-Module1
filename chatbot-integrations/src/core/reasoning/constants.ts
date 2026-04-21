const flowEntries = {
  ask_faq: 'faq',
  ask_pricing: 'pricing',
  select_pricing_category: 'pricing',
  browse_eyewear: 'browse_eyewear',
  select_product_type: 'browse_eyewear',
  select_brand: 'browse_eyewear',
  select_budget: 'browse_eyewear',
  ask_lens_type: 'lens_consultation',
  lens_vision_solutions: 'lens_consultation',
  find_a_store: 'store_lookup',
  store_hours: 'store_lookup',
  choose_city: 'store_lookup',
  search_product: 'product_search',
  search_product_by_attribute: 'product_search',
  product_recommendation: 'product_recommendation',
  inform_budget: 'product_search',
  capture_lead: 'lead_capture',
  share_name: 'lead_capture',
  share_phone: 'lead_capture',
  share_email: 'lead_capture',
  share_location: 'lead_capture',
  share_service_interest: 'lead_capture',
  share_timeline: 'lead_capture',
  book_appointment: 'lead_capture',
  after_sales_support: 'lead_capture',
  order_tracking: 'lead_capture',
  warranty_claim: 'lead_capture',
  human_handoff: 'lead_capture',
  affirm: 'lead_capture',
  deny: 'lead_capture',
} as const

export const RASA_INTENT_TO_FLOW = flowEntries

export const SLOT_TO_INTENT = {
  lead_name: 'share_name',
  contact_number: 'share_phone',
  phone_number: 'share_phone',
  phone: 'share_phone',
  email: 'share_email',
  lead_location: 'share_location',
  location: 'share_location',
  preferred_service: 'share_service_interest',
  purchase_timeline: 'share_timeline',
} as const

export const FAQ_REASONING_INTENT_TO_RASA_INTENT = {
  ask_return_policy: 'ask_faq',
  ask_refund_policy: 'ask_faq',
  ask_warranty_policy: 'ask_faq',
  ask_company_info: 'ask_faq',
} as const

export const FORCEABLE_RASA_INTENTS = new Set([
  'ask_faq',
  'book_appointment',
  'find_a_store',
  'after_sales_support',
  'order_tracking',
  'warranty_claim',
  'human_handoff',
  'capture_lead',
])

export const FAQ_REASONING_INTENTS = new Set(Object.keys(FAQ_REASONING_INTENT_TO_RASA_INTENT))
