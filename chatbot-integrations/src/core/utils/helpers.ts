import crypto from 'crypto'


export function validateMetaSignature(
  rawBody: string,
  signature: string | undefined,
  clientSecret: string
): { valid: boolean; error?: string } {
  if (!clientSecret) {
    return { valid: true } 
  }

  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex')

  const receivedSignature = signature?.split('=')[1]

  if (receivedSignature !== expectedSignature) {
    return {
      valid: false,
      error: `Invalid signature (got ${receivedSignature ?? 'none'}, expected ${expectedSignature})`,
    }
  }

  return { valid: true }
}

export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  if (chunkSize <= 0) return chunks
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

export function truncate(input: string, maxLength: number): string {
  let truncated = input.substring(0, maxLength)
  if (truncated.length < input.length) {
    truncated = truncated.substring(0, maxLength - 1) + '…'
  }
  return truncated
}


export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}


export function safeJsonParse(input: string | undefined): { data: any; success: true } | { data: null; success: false } {
  if (!input) return { data: null, success: false }
  try {
    return { data: JSON.parse(input), success: true }
  } catch {
    return { data: null, success: false }
  }
}


export function extractFileExtension(input: string): string | undefined {
  const match = input.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/)
  return match ? `.${match[1]}` : undefined
}

/**
 * Channel payloads (e.g. WhatsApp Cloud API) often send Unix time as a string in **seconds**.
 * `new Date("1739265432")` is Invalid Date in JS; this normalizes to a real Date for DB fields.
 * Also accepts ISO strings and millisecond epoch strings (13+ digit integers).
 */
export function parseMessageTimestampToDate(raw: string | undefined): Date {
  if (raw === undefined || raw === '') {
    return new Date()
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return new Date()
  }

  if (trimmed.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const fromIso = new Date(trimmed)
    if (!Number.isNaN(fromIso.getTime())) {
      return fromIso
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      return new Date()
    }
    const intPart = Math.trunc(Math.abs(n)).toString()
    if (intPart.length <= 10) {
      return new Date(n * 1000)
    }
    return new Date(n)
  }

  const fallback = new Date(trimmed)
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback
}
