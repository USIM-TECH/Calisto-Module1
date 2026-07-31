import type { CustomerSnapshot } from './runtime-store.interface.js'

/**
 * Build a partial customer update that only carries fields the caller
 * actually provided. Fields can be explicitly cleared by passing `null`,
 * which is normalised to `undefined`.
 */
export function buildCustomerSnapshot(input: CustomerSnapshot): CustomerSnapshot {
  const out: CustomerSnapshot = {}
  for (const key of Object.keys(input) as Array<keyof CustomerSnapshot>) {
    const value = input[key]
    if (value === undefined) {
      continue
    }
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

export function normaliseEmail(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().toLowerCase()
  return trimmed || undefined
}

/** Reduce a phone string to E.164-ish digits so that "+60 12-345" and
 *  "60123450000" collide on the same merge key. */
export function normalisePhone(value: string | undefined): string | undefined {
  if (!value) return undefined
  const digits = value.replace(/\D/g, '')
  return digits || undefined
}
