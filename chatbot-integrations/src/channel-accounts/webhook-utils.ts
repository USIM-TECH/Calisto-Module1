import axios from 'axios'

export type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'

export function extractGraphApiError(error: unknown, channel?: MetaChannel): string {
  const err = error as { response?: { data?: { error?: { message?: string; code?: number } } }; message?: string }
  const meta = err.response?.data?.error
  if (meta?.code === 190) {
    const product = channel === 'whatsapp' ? 'WhatsApp' : channel === 'messenger' ? 'Messenger' : channel === 'instagram' ? 'Instagram' : 'Meta'
    const dashboard = channel === 'whatsapp' ? 'WhatsApp → API Setup' : channel === 'messenger' ? 'Messenger → Settings' : channel === 'instagram' ? 'Instagram → API setup' : 'the relevant Meta product settings'
    return `${product} access token is expired or invalid. In Meta Developer Dashboard → ${dashboard}, generate or select a valid token, then update this account under Channels.`
  }
  if (meta?.message) return meta.message
  return err.message ?? 'Webhook registration failed'
}

export function extractTelegramApiError(error: unknown): string {
  const err = error as { response?: { data?: { description?: string } }; message?: string }
  const description = err.response?.data?.description ?? ''
  if (description.includes('Failed to resolve host') || description.includes('Connection refused')) {
    return 'Webhook URL is not reachable from the internet. Start cloudflared (cloudflared tunnel --url http://localhost:3000), set PUBLIC_BASE_URL in .env to the live https URL, restart the backend, then register again.'
  }
  if (description.includes('HTTPS')) {
    return 'Telegram requires an HTTPS webhook URL. Set PUBLIC_BASE_URL to your https:// tunnel URL, not localhost.'
  }
  if (description) return description
  return err.message ?? 'Telegram webhook registration failed'
}

export function normalizePublicWebhookBaseUrl(publicBaseUrl: string): string {
  const raw = publicBaseUrl.trim().replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('PUBLIC_BASE_URL must be a valid https:// URL.')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  const knownWebhookPath = /^\/webhooks(?:\/(?:messenger|instagram|whatsapp|telegram(?:\/[^/]+)?))?$/.test(path)
  if (path && !knownWebhookPath) {
    throw new Error('PUBLIC_BASE_URL must be the public base URL, not an unrelated path.')
  }
  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

export async function assertPublicWebhookBaseUrl(publicBaseUrl: string): Promise<string> {
  const base = normalizePublicWebhookBaseUrl(publicBaseUrl)
  if (!base.startsWith('https://')) {
    throw new Error('PUBLIC_BASE_URL must start with https:// (Telegram and Meta require a public HTTPS URL).')
  }

  try {
    const healthUrl = `${base}/health`
    const response = await axios.get(healthUrl, { timeout: 8_000, validateStatus: () => true })
    if (response.status < 200 || response.status >= 500) {
      throw new Error(`unreachable (${response.status})`)
    }
  } catch (error: any) {
    const detail = error?.message ?? 'connection failed'
    throw new Error(
      `Public URL ${base} is not reachable: ${detail}. ` +
      'Check that cloudflared is running (cloudflared tunnel --url http://localhost:3000) and the URL is current, then try again.',
    )
  }

  return base
}

export async function validateWhatsAppAccessToken(
  accessToken: string,
  phoneNumberId: string,
  apiVersion: string,
): Promise<void> {
  const { data } = await axios.get(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}`, {
    params: { fields: 'id,display_phone_number', access_token: accessToken },
    timeout: 10_000,
  })
  if (data?.error) {
    throw new Error(extractGraphApiError({ response: { data } }, 'whatsapp'))
  }
}
