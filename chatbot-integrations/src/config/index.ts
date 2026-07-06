import { z } from 'zod'
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

const storageBackendSchema = z.preprocess(
  (value) => (value === 'postgres' ? 'mysql' : value),
  z.enum(['file', 'mysql']).default('mysql'),
)

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    RASA_URL: z.string().default('http://localhost:5005'),
    RASA_TRACKER_INCLUDE_CHANNEL: z
      .preprocess((value) => {
        if (typeof value !== 'string') return value
        return value.trim().toLowerCase()
      }, z.enum(['true', 'false', '1', '0', 'yes', 'no']).default('false'))
      .transform((value) => value === 'true' || value === '1' || value === 'yes'),
    DATA_DIR: optionalString,
    DEDUP_TTL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
    RESPONSE_STYLE: responseStyleSchema,

    LLM_LAYER_ENABLED: z
      .preprocess((value) => {
        if (typeof value !== 'string') return value
        return value.trim().toLowerCase()
      }, z.enum(['true', 'false', '1', '0', 'yes', 'no']).default('true'))
      .transform((value) => value === 'true' || value === '1' || value === 'yes'),
    OLLAMA_URL: z.string().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('llama3'),
    OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
    OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
    /**
     * Below this Rasa NLU confidence we route the message through the LLM
     * fallback. Should match (or sit just above) the `FallbackClassifier`
     * threshold in `calisto_nlp_export/config.yml`.
     */
    RASA_NLU_CONFIDENCE_FLOOR: z.coerce.number().min(0).max(1).default(0.65),
    /**
     * Below this LLM confidence we abandon the LLM result and let Rasa's own
     * `action_default_fallback` produce the user-facing fallback message.
     */
    LLM_CONFIDENCE_FLOOR: z.coerce.number().min(0).max(1).default(0.45),

    STORAGE_BACKEND: storageBackendSchema,
    DATABASE_URL: optionalString,
    /**
     * Absolute base URL used to prefix relative `imageUrl` values when the
     * product card is shipped to channels (Telegram/WhatsApp/etc.) that fetch
     * images from the public internet. In dev, set this to your tunnel URL.
     */
    PUBLIC_BASE_URL: optionalString,

    ADMIN_API_TOKEN: optionalString,
    CHANNEL_CREDENTIALS_ENCRYPTION_KEY: optionalString,

  WEBSITE_AUTH_TOKEN: optionalString,
  WEBSITE_ALLOWED_ORIGINS: optionalString,
  WEBSITE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  WEBSITE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  X_API_KEY: optionalString,
  X_API_SECRET: optionalString,
  X_ACCESS_TOKEN: optionalString,
  X_ACCESS_TOKEN_SECRET: optionalString,
  X_API_BASE_URL: optionalString,

    HUBSPOT_ACCESS_TOKEN: optionalString,

    REDIS_URL: optionalString,
    REDIS_KEY_PREFIX: z.string().default('calisto'),
    CACHE_PRODUCT_CATALOGUE_TTL_SEC: z.coerce.number().int().positive().default(300),
    CACHE_KNOWLEDGE_CHUNKS_TTL_SEC: z.coerce.number().int().positive().default(600),
    CACHE_KNOWLEDGE_SUMMARY_TTL_SEC: z.coerce.number().int().positive().default(300),
    CACHE_LEADS_LIST_TTL_SEC: z.coerce.number().int().positive().default(60),
    CACHE_TELEGRAM_ALIAS_TTL_SEC: z.coerce.number().int().positive().default(86_400),

  })

export interface AppConfig {
  port: number
  rasaUrl: string
  isolateTrackersByChannel: boolean
  dataDir: string
  storageBackend: 'file' | 'mysql'
  /** Set when mysql was requested but `DATABASE_URL` was missing; effective backend is file. */
  usedFileStorageFallback: boolean
  publicBaseUrl?: string
  adminApiToken?: string
  channelCredentialsEncryptionKey?: string
  dedupTtlMs: number
  responseStyle: 'casual' | 'professional' | 'warm' | 'concierge'
  llm: {
    enabled: boolean
    ollamaUrl: string
    model: string
    timeoutMs: number
    temperature: number
    nluConfidenceFloor: number
    llmConfidenceFloor: number
  }
  website: {
    authToken?: string
    allowedOrigins: string[]
    rateLimitMax: number
    rateLimitWindowMs: number
  }
  x?: XConfig
  hubspot?: HubSpotConfig
  cache: {
    redisUrl?: string
    keyPrefix: string
    productCatalogueTtlSec: number
    knowledgeChunksTtlSec: number
    knowledgeSummaryTtlSec: number
    leadsListTtlSec: number
    telegramAliasTtlSec: number
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  const requestedMysql = parsed.STORAGE_BACKEND === 'mysql'
  const mysqlMissingUrl = requestedMysql && !parsed.DATABASE_URL
  const storageBackend = mysqlMissingUrl ? 'file' : parsed.STORAGE_BACKEND

  return {
    port: parsed.PORT,
    rasaUrl: parsed.RASA_URL,
    isolateTrackersByChannel: parsed.RASA_TRACKER_INCLUDE_CHANNEL,
    dataDir: parsed.DATA_DIR ?? 'data/runtime',
    storageBackend,
    usedFileStorageFallback: mysqlMissingUrl,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    adminApiToken: parsed.ADMIN_API_TOKEN,
    channelCredentialsEncryptionKey: parsed.CHANNEL_CREDENTIALS_ENCRYPTION_KEY,
    dedupTtlMs: parsed.DEDUP_TTL_MS,
    responseStyle: parsed.RESPONSE_STYLE,
    llm: {
      enabled: parsed.LLM_LAYER_ENABLED,
      ollamaUrl: parsed.OLLAMA_URL,
      model: parsed.OLLAMA_MODEL,
      timeoutMs: parsed.OLLAMA_TIMEOUT_MS,
      temperature: parsed.OLLAMA_TEMPERATURE,
      nluConfidenceFloor: parsed.RASA_NLU_CONFIDENCE_FLOOR,
      llmConfidenceFloor: parsed.LLM_CONFIDENCE_FLOOR,
    },
    website: {
      authToken: parsed.WEBSITE_AUTH_TOKEN,
      allowedOrigins: (parsed.WEBSITE_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      rateLimitMax: parsed.WEBSITE_RATE_LIMIT_MAX,
      rateLimitWindowMs: parsed.WEBSITE_RATE_LIMIT_WINDOW_MS,
    },
    x: parsed.X_API_KEY && parsed.X_API_SECRET && parsed.X_ACCESS_TOKEN && parsed.X_ACCESS_TOKEN_SECRET
      ? {
          consumerKey: parsed.X_API_KEY,
          consumerSecret: parsed.X_API_SECRET,
          accessToken: parsed.X_ACCESS_TOKEN,
          accessTokenSecret: parsed.X_ACCESS_TOKEN_SECRET,
          apiBaseUrl: parsed.X_API_BASE_URL,
        }
      : undefined,
    hubspot: parsed.HUBSPOT_ACCESS_TOKEN
      ? { accessToken: parsed.HUBSPOT_ACCESS_TOKEN }
      : undefined,
    cache: {
      redisUrl: parsed.REDIS_URL,
      keyPrefix: parsed.REDIS_KEY_PREFIX,
      productCatalogueTtlSec: parsed.CACHE_PRODUCT_CATALOGUE_TTL_SEC,
      knowledgeChunksTtlSec: parsed.CACHE_KNOWLEDGE_CHUNKS_TTL_SEC,
      knowledgeSummaryTtlSec: parsed.CACHE_KNOWLEDGE_SUMMARY_TTL_SEC,
      leadsListTtlSec: parsed.CACHE_LEADS_LIST_TTL_SEC,
      telegramAliasTtlSec: parsed.CACHE_TELEGRAM_ALIAS_TTL_SEC,
    },
  }
}
