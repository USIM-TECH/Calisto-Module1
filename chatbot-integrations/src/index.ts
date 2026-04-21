export { WhatsAppChannel, type WhatsAppConfig } from './integrations/channels/whatsapp/index.js'
export { InstagramChannel, type InstagramConfig } from './integrations/channels/instagram/index.js'
export { MessengerChannel, type MessengerConfig } from './integrations/channels/messenger/index.js'
export { TelegramChannel, type TelegramConfig } from './integrations/channels/telegram/index.js'
export { XChannel, type XConfig } from './integrations/channels/x/index.js'
export { WebsiteChannel, type WebsiteChatRequest, type WebsiteChatResponse } from './integrations/channels/website/index.js'
export { HubSpotClient, type HubSpotConfig } from './integrations/crm/hubspot/index.js'
export { createWebhookRouter, type WebhookRouterConfig } from './core/webhook/index.js'
export { verifyMetaSignature } from './core/auth/index.js'
export { LocalReasoningClient, ReasoningEngine, adaptMessagesForEmotion } from './core/reasoning/index.js'
export { type Logger, ConsoleLogger, createConsoleLogger } from './core/utils/logger.js'
export { validateMetaSignature, chunkArray, truncate, sleep, safeJsonParse } from './core/utils/helpers.js'
export {
  NLPClient,
  type NLPClientConfig,
  type NLPParseResponse,
  type NLPRequestMetadata,
  type NLPResponse,
  type NLPTrackerSnapshot,
} from './core/utils/nlp-client.js'


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
