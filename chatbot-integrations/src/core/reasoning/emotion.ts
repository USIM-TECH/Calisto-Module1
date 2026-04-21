import type { ReasoningEmotion } from './types.js'

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

export function detectEmotion(value: string, expectedSlot?: string): ReasoningEmotion {
  const normalized = normalizeText(value)
  if (!normalized) {
    return 'neutral'
  }

  const frustratedSignals = [
    'this is frustrating',
    'you are not helping',
    'this is useless',
    'why is this taking so long',
    'still not working',
    'i already told you',
    'ridiculous',
    'annoying',
    'angry',
    'upset',
    'terrible',
  ]
  if (frustratedSignals.some((signal) => normalized.includes(signal)) || /!{2,}/.test(value)) {
    return 'frustrated'
  }

  const confusedSignals = [
    'i do not understand',
    "i don't understand",
    'what do you mean',
    'can you explain',
    'how does that work',
    'i am confused',
    "i'm confused",
    'not sure what you mean',
  ]
  if (confusedSignals.some((signal) => normalized.includes(signal))) {
    return 'confused'
  }

  const hesitantSignals = [
    'i do not want',
    "i don't want",
    'prefer not',
    'not comfortable',
    'maybe later',
    'not now',
    'just browsing',
    'just exploring',
    'not ready',
  ]
  if (
    hesitantSignals.some((signal) => normalized.includes(signal))
    || (expectedSlot && /^(?:no|nah|not really|maybe)$/.test(normalized))
  ) {
    return 'hesitant'
  }

  const interestedSignals = [
    'i want',
    'show me',
    'looking for',
    'recommend',
    'price',
    'book',
    'need',
    'tell me about',
    'what is your',
    'which one',
  ]
  if (interestedSignals.some((signal) => normalized.includes(signal))) {
    return 'interested'
  }

  if (normalized.includes('?')) {
    return 'confused'
  }

  return 'neutral'
}
