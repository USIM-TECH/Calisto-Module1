import { z } from 'zod'
import type { InstagramConfig } from '../integrations/channels/instagram/index.js'
import type { MessengerConfig } from '../integrations/channels/messenger/index.js'
import type { TelegramConfig } from '../integrations/channels/telegram/index.js'
import type { WhatsAppConfig } from '../integrations/channels/whatsapp/index.js'
import type { XConfig } from '../integrations/channels/x/index.js'
import type { HubSpotConfig } from '../integrations/crm/hubspot/index.js'

const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, z.string().optional())

const responseStyleSchema = z.enum(['casual', 'professional', 'warm', 'concierge']).default('casual')

const storageBackendSchema = z.enum(['file', 'postgres']).default('postgres')

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    RASA_URL: z.string().default('http://localhost:5005'),
    DATA_DIR: optionalString,
    DEDUP_TTL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
    RESPONSE_STYLE: responseStyleSchema,

    STORAGE_BACKEND: storageBackendSchema,
    DATABASE_URL: optionalString,

  WEBSITE_AUTH_TOKEN: optionalString,
  WEBSITE_ALLOWED_ORIGINS: optionalString,
  WEBSITE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  WEBSITE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

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

  X_API_KEY: optionalString,
  X_API_SECRET: optionalString,
  X_ACCESS_TOKEN: optionalString,
  X_ACCESS_TOKEN_SECRET: optionalString,
  X_API_BASE_URL: optionalString,

  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_SECRET_TOKEN: optionalString,
  TELEGRAM_API_BASE_URL: optionalString,

  HUBSPOT_ACCESS_TOKEN: optionalString,

  })

export interface AppConfig {
  port: number
  rasaUrl: string
  dataDir: string
  storageBackend: 'file' | 'postgres'
  /** Set when postgres was requested but `DATABASE_URL` was missing; effective backend is file. */
  usedFileStorageFallback: boolean
  dedupTtlMs: number
  responseStyle: 'casual' | 'professional' | 'warm' | 'concierge'
  website: {
    authToken?: string
    allowedOrigins: string[]
    rateLimitMax: number
    rateLimitWindowMs: number
  }
  whatsapp?: WhatsAppConfig
  instagram?: InstagramConfig
  messenger?: MessengerConfig
  telegram?: TelegramConfig
  x?: XConfig
  hubspot?: HubSpotConfig
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  const requestedPostgres = parsed.STORAGE_BACKEND === 'postgres'
  const postgresMissingUrl = requestedPostgres && !parsed.DATABASE_URL
  const storageBackend = postgresMissingUrl ? 'file' : parsed.STORAGE_BACKEND

  return {
    port: parsed.PORT,
    rasaUrl: parsed.RASA_URL,
    dataDir: parsed.DATA_DIR ?? 'data/runtime',
    storageBackend,
    usedFileStorageFallback: postgresMissingUrl,
    dedupTtlMs: parsed.DEDUP_TTL_MS,
    responseStyle: parsed.RESPONSE_STYLE,
    website: {
      authToken: parsed.WEBSITE_AUTH_TOKEN,
      allowedOrigins: (parsed.WEBSITE_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      rateLimitMax: parsed.WEBSITE_RATE_LIMIT_MAX,
      rateLimitWindowMs: parsed.WEBSITE_RATE_LIMIT_WINDOW_MS,
    },
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
    x: parsed.X_API_KEY && parsed.X_API_SECRET && parsed.X_ACCESS_TOKEN && parsed.X_ACCESS_TOKEN_SECRET
      ? {
          consumerKey: parsed.X_API_KEY,
          consumerSecret: parsed.X_API_SECRET,
          accessToken: parsed.X_ACCESS_TOKEN,
          accessTokenSecret: parsed.X_ACCESS_TOKEN_SECRET,
          apiBaseUrl: parsed.X_API_BASE_URL,
        }
      : undefined,
    telegram: parsed.TELEGRAM_BOT_TOKEN
      ? {
          botToken: parsed.TELEGRAM_BOT_TOKEN,
          secretToken: parsed.TELEGRAM_SECRET_TOKEN,
          apiBaseUrl: parsed.TELEGRAM_API_BASE_URL,
        }
      : undefined,
    hubspot: parsed.HUBSPOT_ACCESS_TOKEN
      ? { accessToken: parsed.HUBSPOT_ACCESS_TOKEN }
      : undefined,
  }
}
