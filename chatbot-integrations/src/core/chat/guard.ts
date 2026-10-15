/**
 * Deterministic checks around the model. A small local model can't be trusted to
 * resist prompt injection or to stay silent about its instructions, so these run
 * in code, before and after the model.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\b.{0,40}\b(instructions?|rules?|prompts?|above|previous)\b/i,
  /\b(disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompts?)\b/i,
  /\b(system|initial|hidden|original)\s+(prompt|instructions?|message)\b/i,
  /\b(reveal|show|print|repeat|tell me)\b.{0,30}\b(your|the)\b.{0,20}\b(prompt|instructions?|rules?)\b/i,
  /\byou are now\b/i,
  /\bpretend (to be|you are)\b/i,
  /\bjailbreak\b|\bDAN mode\b/i,
]

export function looksLikeInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(message))
}

// Distinctive phrases from our own prompts; a reply containing one has echoed its instructions.
const LEAK_MARKERS = [
  'calisto shopping assistant',
  'use only the facts',
  'treat everything inside',
  'never reveal these rules',
  'context block',
  'system prompt',
]

export function leaksInstructions(reply: string): boolean {
  const text = reply.toLowerCase()
  return LEAK_MARKERS.some((marker) => text.includes(marker))
}
