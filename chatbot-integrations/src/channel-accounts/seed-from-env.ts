import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPrismaClient } from '../db/prisma.js'
import { ChannelAccountStore } from './channel-account-store.js'
import type { ChannelAccountInput } from './credential-types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function buildCandidates(): ChannelAccountInput[] {
  const items: ChannelAccountInput[] = []

  const waToken = optionalEnv('WHATSAPP_ACCESS_TOKEN')
  const waPhone = optionalEnv('WHATSAPP_PHONE_NUMBER_ID')
  const waVerify = optionalEnv('WHATSAPP_VERIFY_TOKEN')
  if (waToken && waPhone && waVerify) {
    items.push({
      label: 'Imported WhatsApp',
      channel: 'whatsapp',
      verifyToken: waVerify,
      metaAppId: optionalEnv('MESSENGER_CLIENT_ID') ?? optionalEnv('INSTAGRAM_CLIENT_ID'),
      apiVersion: optionalEnv('WHATSAPP_API_VERSION'),
      credentials: {
        accessToken: waToken,
        phoneNumberId: waPhone,
        clientSecret: optionalEnv('WHATSAPP_CLIENT_SECRET') ?? optionalEnv('MESSENGER_CLIENT_SECRET'),
        clientId: optionalEnv('MESSENGER_CLIENT_ID') ?? optionalEnv('INSTAGRAM_CLIENT_ID'),
        wabaId: optionalEnv('WHATSAPP_WABA_ID'),
      },
    })
  }

  const igToken = optionalEnv('INSTAGRAM_ACCESS_TOKEN')
  const igId = optionalEnv('INSTAGRAM_ID')
  const igVerify = optionalEnv('INSTAGRAM_VERIFY_TOKEN')
  if (igToken && igId && igVerify) {
    items.push({
      label: 'Imported Instagram',
      channel: 'instagram',
      verifyToken: igVerify,
      metaAppId: optionalEnv('INSTAGRAM_CLIENT_ID'),
      apiVersion: optionalEnv('INSTAGRAM_API_VERSION'),
      credentials: {
        accessToken: igToken,
        instagramId: igId,
        clientId: optionalEnv('INSTAGRAM_CLIENT_ID') ?? '',
        clientSecret: optionalEnv('INSTAGRAM_CLIENT_SECRET'),
      },
    })
  }

  const msgToken = optionalEnv('MESSENGER_PAGE_ACCESS_TOKEN')
  const msgPage = optionalEnv('MESSENGER_PAGE_ID')
  const msgVerify = optionalEnv('MESSENGER_VERIFY_TOKEN')
  if (msgToken && msgPage && msgVerify) {
    items.push({
      label: 'Imported Messenger',
      channel: 'messenger',
      verifyToken: msgVerify,
      metaAppId: optionalEnv('MESSENGER_CLIENT_ID'),
      apiVersion: optionalEnv('MESSENGER_API_VERSION'),
      credentials: {
        pageAccessToken: msgToken,
        pageId: msgPage,
        clientId: optionalEnv('MESSENGER_CLIENT_ID') ?? '',
        clientSecret: optionalEnv('MESSENGER_CLIENT_SECRET'),
        appToken: optionalEnv('MESSENGER_APP_TOKEN'),
      },
    })
  }

  const tgToken = optionalEnv('TELEGRAM_BOT_TOKEN')
  if (tgToken) {
    items.push({
      label: 'Imported Telegram',
      channel: 'telegram',
      credentials: {
        botToken: tgToken,
        secretToken: optionalEnv('TELEGRAM_SECRET_TOKEN'),
        apiBaseUrl: optionalEnv('TELEGRAM_API_BASE_URL'),
      },
    })
  }

  return items
}

export async function seedChannelAccountsFromEnv(encryptionKey: string): Promise<number> {
  const prisma = getPrismaClient()
  const store = new ChannelAccountStore(prisma, encryptionKey)
  const existing = await store.count()
  if (existing > 0) {
    return 0
  }

  const candidates = buildCandidates()
  let created = 0
  for (const input of candidates) {
    await store.create(input)
    created += 1
  }
  return created
}

async function main() {
  const encryptionKey = optionalEnv('CHANNEL_CREDENTIALS_ENCRYPTION_KEY')
  if (!encryptionKey) {
    throw new Error('CHANNEL_CREDENTIALS_ENCRYPTION_KEY is required')
  }
  const created = await seedChannelAccountsFromEnv(encryptionKey)
  console.log(created > 0 ? `Imported ${created} channel account(s) from .env` : 'No channel accounts imported (table not empty or .env empty)')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
