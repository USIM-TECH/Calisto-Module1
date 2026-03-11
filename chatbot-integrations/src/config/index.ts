import { z } from 'zod'
import type { InstagramConfig } from '../integrations/channels/instagram/index.js'
import type { MessengerConfig } from '../integrations/channels/messenger/index.js'
import type { WhatsAppConfig } from '../integrations/channels/whatsapp/index.js'
import type { HubSpotConfig } from '../integrations/crm/hubspot/index.js'

const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, z.string().optional())

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  RASA_URL: z.string().default('http://localhost:5005'),

  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
  WHATSAPP_CLIENT_SECRET: optionalString,
  WHATSAPP_API_VERSION: optionalString,

  INSTAGRAM_ACCESS_TOKEN: optionalString,
  INSTAGRAM_ID: optionalString,
  INSTAGRAM_VERIFY_TOKEN: optionalString,
  INSTAGRAM_CLIENT_ID: optionalString,
  INSTAGRAM_CLIENT_SECRET: optionalString,
  INSTAGRAM_API_VERSION: optionalString,

  MESSENGER_PAGE_ACCESS_TOKEN: optionalString,
  MESSENGER_PAGE_ID: optionalString,
  MESSENGER_VERIFY_TOKEN: optionalString,
  MESSENGER_CLIENT_ID: optionalString,
  MESSENGER_CLIENT_SECRET: optionalString,
  MESSENGER_APP_TOKEN: optionalString,
  MESSENGER_API_VERSION: optionalString,

  HUBSPOT_ACCESS_TOKEN: optionalString,

})

export interface AppConfig {
  port: number
  rasaUrl: string
  whatsapp?: WhatsAppConfig
  instagram?: InstagramConfig
  messenger?: MessengerConfig
  hubspot?: HubSpotConfig
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  return {
    port: parsed.PORT,
    rasaUrl: parsed.RASA_URL,
    whatsapp: parsed.WHATSAPP_ACCESS_TOKEN && parsed.WHATSAPP_PHONE_NUMBER_ID && parsed.WHATSAPP_VERIFY_TOKEN
      ? {
          accessToken: parsed.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: parsed.WHATSAPP_PHONE_NUMBER_ID,
          verifyToken: parsed.WHATSAPP_VERIFY_TOKEN,
          clientSecret: parsed.WHATSAPP_CLIENT_SECRET,
          apiVersion: parsed.WHATSAPP_API_VERSION,
        }
      : undefined,
    instagram: parsed.INSTAGRAM_ACCESS_TOKEN && parsed.INSTAGRAM_ID && parsed.INSTAGRAM_VERIFY_TOKEN
      ? {
          accessToken: parsed.INSTAGRAM_ACCESS_TOKEN,
          instagramId: parsed.INSTAGRAM_ID,
          verifyToken: parsed.INSTAGRAM_VERIFY_TOKEN,
          clientId: parsed.INSTAGRAM_CLIENT_ID ?? '',
          clientSecret: parsed.INSTAGRAM_CLIENT_SECRET,
          apiVersion: parsed.INSTAGRAM_API_VERSION,
        }
      : undefined,
    messenger: parsed.MESSENGER_PAGE_ACCESS_TOKEN && parsed.MESSENGER_PAGE_ID && parsed.MESSENGER_VERIFY_TOKEN
      ? {
          pageAccessToken: parsed.MESSENGER_PAGE_ACCESS_TOKEN,
          pageId: parsed.MESSENGER_PAGE_ID,
          verifyToken: parsed.MESSENGER_VERIFY_TOKEN,
          clientId: parsed.MESSENGER_CLIENT_ID ?? '',
          clientSecret: parsed.MESSENGER_CLIENT_SECRET,
          appToken: parsed.MESSENGER_APP_TOKEN,
          apiVersion: parsed.MESSENGER_API_VERSION,
        }
      : undefined,
    hubspot: parsed.HUBSPOT_ACCESS_TOKEN
      ? { accessToken: parsed.HUBSPOT_ACCESS_TOKEN }
      : undefined,
  }
}
