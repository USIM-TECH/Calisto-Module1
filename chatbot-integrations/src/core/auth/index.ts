import * as crypto from 'crypto'


// Meta (Facebook/Instagram/WhatsApp) HMAC-SHA256 signature verification.

export function verifyMetaSignature(
  body: string | undefined,
  signatureHeader: string | undefined,
  clientSecret: string
): boolean {
  if (!signatureHeader || !body) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(body)
    .digest('hex')

  const signature = signatureHeader.startsWith('sha256=')
    ? signatureHeader.split('=')[1]
    : signatureHeader

  return signature === expectedSignature
}
