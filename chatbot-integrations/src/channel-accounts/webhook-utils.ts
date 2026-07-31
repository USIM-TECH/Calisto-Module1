import axios from 'axios'

export function extractGraphApiError(error: unknown): string {
  const err = error as { response?: { data?: { error?: { message?: string; code?: number } } }; message?: string }
  const meta = err.response?.data?.error
  if (meta?.code === 190) {
    return 'WhatsApp access token is expired or invalid. In Meta Developer Dashboard → WhatsApp → API Setup, generate a new access token, then update this account under Channels (edit credentials).'
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

export async function assertPublicWebhookBaseUrl(publicBaseUrl: string): Promise<string> {
  const base = publicBaseUrl.replace(/\/$/, '')
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
      `PUBLIC_BASE_URL (${base}) is not reachable: ${detail}. ` +
      'Start cloudflared tunnel --url http://localhost:3000, update PUBLIC_BASE_URL in .env, restart the server, then try again.',
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
    throw new Error(extractGraphApiError({ response: { data } }))
  }
}
