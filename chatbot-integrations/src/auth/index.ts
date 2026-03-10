import * as crypto from 'crypto'
import { google } from 'googleapis'

/**
 * Meta (Facebook/Instagram/WhatsApp) HMAC-SHA256 signature verification.
 */
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

/**
 * Google OAuth2 client helper.
 * Creates and returns an authenticated OAuth2 client for Google APIs.
 */
export function createGoogleOAuth2Client({
  clientId,
  clientSecret,
  refreshToken,
  redirectUri,
}: {
  clientId: string
  clientSecret: string
  refreshToken: string
  redirectUri?: string
}): InstanceType<(typeof google.auth)['OAuth2']> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

/**
 * Generate a Google OAuth2 authorization URL.
 * Used for the initial OAuth flow where the user grants permissions.
 */
export function getGoogleAuthUrl({
  clientId,
  clientSecret,
  redirectUri,
  scopes,
}: {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}): string {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  })
}

/**
 * Exchange a Google authorization code for tokens.
 */
export async function exchangeGoogleAuthCode({
  clientId,
  clientSecret,
  redirectUri,
  authorizationCode,
}: {
  clientId: string
  clientSecret: string
  redirectUri: string
  authorizationCode: string
}): Promise<{ accessToken: string; refreshToken: string | null; expiryDate: number | null }> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  const { tokens } = await oauth2Client.getToken(authorizationCode)
  return {
    accessToken: tokens.access_token ?? '',
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
  }
}
