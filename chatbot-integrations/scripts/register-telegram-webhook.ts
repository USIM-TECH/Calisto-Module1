import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

type TelegramSetWebhookResponse = {
  ok: boolean
  result?: boolean
  description?: string
}

type TelegramGetWebhookInfoResponse = {
  ok: boolean
  result?: {
    url?: string
    pending_update_count?: number
    last_error_date?: number
    last_error_message?: string
    max_connections?: number
    ip_address?: string
  }
  description?: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function getArgPublicUrl(): string {
  const arg = process.argv.slice(2).find((v) => !v.startsWith('-=')) ?? ''
  if (!arg) {
    throw new Error('Usage: tsx scripts/register-telegram-webhook.ts <publicBaseUrl>')
  }
  return arg
}

async function main() {
  const publicBaseUrl = getArgPublicUrl().replace(/\/$/, '')
  if (!publicBaseUrl.startsWith('https://')) {
    throw new Error(`publicBaseUrl must start with https:// (got: ${publicBaseUrl})`)
  }

  const botToken = requireEnv('TELEGRAM_BOT_TOKEN')
  const secretToken = process.env.TELEGRAM_SECRET_TOKEN?.trim()
  const apiBaseUrl = (process.env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org').replace(/\/$/, '')

  const webhookUrl = `${publicBaseUrl}/webhooks/telegram`
  const setWebhookUrl = `${apiBaseUrl}/bot${botToken}/setWebhook`
  const getWebhookInfoUrl = `${apiBaseUrl}/bot${botToken}/getWebhookInfo`

  const setRes = await fetch(setWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken || undefined,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: true,
    }),
  })

  const setJson = (await setRes.json().catch(() => ({}))) as TelegramSetWebhookResponse
  if (!setRes.ok || !setJson.ok) {
    throw new Error(`setWebhook failed: HTTP ${setRes.status} ${setJson.description ?? ''}`.trim())
  }

  const infoRes = await fetch(getWebhookInfoUrl)
  const infoJson = (await infoRes.json().catch(() => ({}))) as TelegramGetWebhookInfoResponse

  if (!infoRes.ok || !infoJson.ok) {
    throw new Error(`getWebhookInfo failed: HTTP ${infoRes.status} ${infoJson.description ?? ''}`.trim())
  }

  const configuredUrl = infoJson.result?.url ?? ''
  const pending = infoJson.result?.pending_update_count ?? 0
  const lastErr = infoJson.result?.last_error_message

  // Do not print the bot token.
  console.log('Telegram webhook configured')
  console.log(`- url: ${configuredUrl || webhookUrl}`)
  console.log(`- pending_update_count: ${pending}`)
  if (lastErr) {
    console.log(`- last_error: ${lastErr}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
