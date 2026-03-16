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
