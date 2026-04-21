import { SLOT_TO_INTENT } from './constants.js'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeFreeText(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function stripCommonPrefixes(value: string): string {
  return value.replace(/^(?:my name is|i am|i'm|this is|name is)\s+/i, '').trim().replace(/^[.,-]+\s*/, '')
}

function isRefusal(text: string): boolean {
  const normalized = normalizeFreeText(text).toLowerCase()
  const refusalPatterns = [
    /\bi do not want to\b/,
    /\bi don't want to\b/,
    /\bprefer not to\b/,
    /\bnot comfortable\b/,
    /\bwon't share\b/,
    /\bcannot share\b/,
    /\bdon't have\b/,
    /\bno phone\b/,
    /\bno email\b/,
    /\btak nak\b/,
    /\btidak mahu\b/,
    /\btak mahu\b/,
  ]

  return refusalPatterns.some((pattern) => pattern.test(normalized))
}

function isValidName(value: string): boolean {
  const normalized = stripCommonPrefixes(normalizeFreeText(value))
  if (normalized.length < 2 || normalized.length > 60) {
    return false
  }

  if (isRefusal(normalized) || normalized.includes('@') || /\d/.test(normalized) || /[?!]/.test(normalized)) {
    return false
  }

  const disallowedKeywords = new Set([
    'glasses',
    'frames',
    'sunglasses',
    'lenses',
    'price',
    'pricing',
    'gucci',
    'rayban',
    'store',
    'appointment',
  ])
  const loweredTokens = (normalized.toLowerCase().match(/[a-z]+/g) ?? [])
  if (loweredTokens.some((token) => disallowedKeywords.has(token))) {
    return false
  }

  return /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(normalized)
}

function isValidPhone(value: string): boolean {
  const normalized = value.replace(/[^\d+]/g, '')
  const digits = normalized.replace(/\D/g, '')
  return !isRefusal(value) && digits.length >= 8 && digits.length <= 15
}

function isValidEmail(value: string): boolean {
  const normalized = normalizeFreeText(value)
  return !isRefusal(normalized) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)
}

function isValidLocation(value: string): boolean {
  const normalized = normalizeFreeText(value)
  if (normalized.length < 2 || normalized.length > 80) {
    return false
  }

  if (isRefusal(normalized) || normalized.includes('@') || /\b\d{5,}\b/.test(normalized)) {
    return false
  }

  return /^[A-Za-z0-9 .,'/\-]{2,80}$/.test(normalized)
}

function isValidService(value: string): boolean {
  const normalized = normalizeFreeText(value)
  if (normalized.length < 3 || normalized.length > 80 || isRefusal(normalized)) {
    return false
  }

  return !isValidEmail(normalized) && !isValidPhone(normalized)
}

function normalizeTimeline(value: string): string | undefined {
  const normalized = normalizeFreeText(value).toLowerCase()
  const allowed = {
    'this week': 'This Week',
    'within 2 weeks': 'Within 2 Weeks',
    'within two weeks': 'Within 2 Weeks',
    'just exploring': 'Just Exploring',
  } as const

  if (normalized in allowed) {
    return allowed[normalized as keyof typeof allowed]
  }

  if (normalized.includes('this week')) {
    return 'This Week'
  }
  if (normalized.includes('2 week') || normalized.includes('two week')) {
    return 'Within 2 Weeks'
  }
  if (['exploring', 'looking around', 'just checking', 'surveying'].some((token) => normalized.includes(token))) {
    return 'Just Exploring'
  }

  return undefined
}

export function isExpectedSlotValue(slotName: string | undefined, value: string): boolean {
  if (!slotName) {
    return false
  }

  switch (slotName) {
    case 'lead_name':
      return isValidName(value)
    case 'contact_number':
    case 'phone_number':
    case 'phone':
      return isValidPhone(value)
    case 'email':
      return isValidEmail(value)
    case 'lead_location':
    case 'location':
      return isValidLocation(value)
    case 'preferred_service':
      return isValidService(value)
    case 'purchase_timeline':
      return Boolean(normalizeTimeline(value))
    default:
      return false
  }
}

export function inferSlotIntent(slotName: string | undefined): string {
  if (!slotName) {
    return 'general_query'
  }

  return SLOT_TO_INTENT[slotName as keyof typeof SLOT_TO_INTENT] ?? 'general_query'
}
