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
export { WhatsAppChannel, type WhatsAppConfig } from './channels/whatsapp/index.js'
export { InstagramChannel, type InstagramConfig } from './channels/instagram/index.js'
export { MessengerChannel, type MessengerConfig } from './channels/messenger/index.js'

// ── CRM ─────────────────────────────────────────────────────────
export { HubSpotClient, type HubSpotConfig } from './crm/hubspot/index.js'

// ── Data ────────────────────────────────────────────────────────
export { GSheetsClient, type GSheetsConfig, type MajorDimension } from './data/gsheets/index.js'

// ── Notifications ───────────────────────────────────────────────
export { GmailEmailClient, type GmailConfig } from './notifications/email/index.js'

// ── Webhook ─────────────────────────────────────────────────────
export { createWebhookRouter, type WebhookRouterConfig } from './webhook/index.js'

// ── Auth ────────────────────────────────────────────────────────
export {
  verifyMetaSignature,
  createGoogleOAuth2Client,
  getGoogleAuthUrl,
  exchangeGoogleAuthCode,
} from './auth/index.js'

// ── Utilities ───────────────────────────────────────────────────
export { type Logger, ConsoleLogger, createConsoleLogger } from './utils/logger.js'
export { validateMetaSignature, chunkArray, truncate, sleep, safeJsonParse } from './utils/helpers.js'
export { NLPClient, type NLPClientConfig, type NLPResponse } from './utils/nlpClient.js'

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
} from './types.js'
