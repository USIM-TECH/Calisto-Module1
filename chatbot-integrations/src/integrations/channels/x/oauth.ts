import crypto from 'crypto'

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function normalizeParams(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue)
      }
      return leftKey.localeCompare(rightKey)
    })
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&')
}

export function createOAuthHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  accessToken,
  accessTokenSecret,
  queryParams = {},
}: {
  method: 'GET' | 'POST'
  url: string
  consumerKey: string
  consumerSecret: string
  accessToken: string
  accessTokenSecret: string
  queryParams?: Record<string, string>
}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }

  const signatureParams = { ...oauthParams, ...queryParams }
  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalizeParams(signatureParams)),
  ].join('&')

  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`
  oauthParams.oauth_signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')

  const authHeader = Object.entries(oauthParams)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(', ')

  return `OAuth ${authHeader}`
}

export function createWebhookCrcResponse(crcToken: string, consumerSecret: string): string {
  const digest = crypto
    .createHmac('sha256', consumerSecret)
    .update(crcToken)
    .digest('base64')

  return `sha256=${digest}`
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  consumerSecret: string
): boolean {
  if (!signatureHeader) {
    return false
  }

  const expected = createWebhookCrcResponse(rawBody, consumerSecret)
  return signatureHeader === expected
}
