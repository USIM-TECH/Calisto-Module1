/**
 * Chatbot Integrations — Standalone Integration Layer
 *
 * Extracted from the Botpress Cloud open-source repository.
 * All Botpress SDK dependencies have been replaced with standalone equivalents.
 *
 * This is the **future NLP connection point** — hook into the `onMessage` callbacks
 * of each channel to route incoming messages to your chatbot / NLP engine.
 */

// ── Channels ────────────────────────────────────────────────────
export { WhatsAppChannel, type WhatsAppConfig } from './integrations/channels/whatsapp/index.js'
export { InstagramChannel, type InstagramConfig } from './integrations/channels/instagram/index.js'
export { MessengerChannel, type MessengerConfig } from './integrations/channels/messenger/index.js'
export { TelegramChannel, type TelegramConfig } from './integrations/channels/telegram/index.js'
export { XChannel, type XConfig } from './integrations/channels/x/index.js'

// ── CRM ─────────────────────────────────────────────────────────
export { HubSpotClient, type HubSpotConfig } from './integrations/crm/hubspot/index.js'

// ── Webhook ─────────────────────────────────────────────────────
export { createWebhookRouter, type WebhookRouterConfig } from './core/webhook/index.js'

// ── Auth ────────────────────────────────────────────────────────
export { verifyMetaSignature } from './core/auth/index.js'

// ── Utilities ───────────────────────────────────────────────────
export { type Logger, ConsoleLogger, createConsoleLogger } from './core/utils/logger.js'
export { validateMetaSignature, chunkArray, truncate, sleep, safeJsonParse } from './core/utils/helpers.js'
export { NLPClient, type NLPClientConfig, type NLPResponse } from './core/utils/nlp-client.js'

// ── Types ───────────────────────────────────────────────────────
export type {
  IncomingMessage,
  OutgoingMessage,
  OutgoingTextMessage,
  OutgoingImageMessage,
  OutgoingAudioMessage,
  OutgoingVideoMessage,
  OutgoingFileMessage,
  OutgoingLocationMessage,
  OutgoingCardMessage,
  OutgoingChoiceMessage,
  MessageHandler,
  CrmContact,
  CrmDeal,
  CrmLead,
  WebhookRequest,
  WebhookResponse,
} from './core/types.js'
