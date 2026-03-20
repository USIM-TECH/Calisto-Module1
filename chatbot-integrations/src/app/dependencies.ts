import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import type { AppConfig } from '../config/index.js'
import { loadConfig } from '../config/index.js'
import { ConsoleLogger, NLPClient, type Logger } from '../core/utils/index.js'
import { InstagramChannel } from '../integrations/channels/instagram/index.js'
import { MessengerChannel } from '../integrations/channels/messenger/index.js'
import { TelegramChannel } from '../integrations/channels/telegram/index.js'
import { WhatsAppChannel } from '../integrations/channels/whatsapp/index.js'
import { XChannel } from '../integrations/channels/x/index.js'
import { WebsiteChannel } from '../integrations/channels/website/index.js'
import { HubSpotClient } from '../integrations/crm/hubspot/index.js'
import {
  createMessageDeduplicator,
  createRuntimeStore,
  type MessageDeduplicator,
  LeadOrchestrator,
  type RuntimeStore,
} from '../leads/index.js'
import { createNlpMessageHandler } from './message-handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface AppDependencies {
  config: AppConfig
  logger: Logger
  deduplicator: MessageDeduplicator
  runtimeStore: RuntimeStore
  orchestrator: LeadOrchestrator
  nlpClient: NLPClient
  whatsapp?: WhatsAppChannel
  instagram?: InstagramChannel
  messenger?: MessengerChannel
  telegram?: TelegramChannel
  x?: XChannel
  website: WebsiteChannel
  hubspot?: HubSpotClient
}

export function loadEnvironment(): void {
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })
}

export function createDependencies(): AppDependencies {
  loadEnvironment()

  const logger: Logger = new ConsoleLogger()
  const config = loadConfig()
  if (config.usedFileStorageFallback) {
    logger.warn(
      'STORAGE_BACKEND is postgres but DATABASE_URL is not set; falling back to file storage (runtime-store.json).',
    )
  }
  const runtimeStore = createRuntimeStore({
    backend: config.storageBackend,
    dataDir: config.dataDir,
  })
  const deduplicator = createMessageDeduplicator(runtimeStore, config.dedupTtlMs)
  const nlpClient = new NLPClient({ rasaUrl: config.rasaUrl }, logger)

  logger.info(`NLP client configured for ${config.rasaUrl}`)

  let whatsapp: WhatsAppChannel | undefined
  let instagram: InstagramChannel | undefined
  let messenger: MessengerChannel | undefined
  let telegram: TelegramChannel | undefined
  let x: XChannel | undefined
  let hubspot: HubSpotClient | undefined

  if (config.hubspot) {
    hubspot = new HubSpotClient(config.hubspot, logger)
    logger.info('HubSpot client enabled')
  }

  const orchestrator = new LeadOrchestrator({
    logger,
    nlpClient,
    deduplicator,
    runtimeStore,
    hubspot,
    responseStyle: config.responseStyle,
  })
  const website = new WebsiteChannel(orchestrator, logger)

  if (config.whatsapp) {
    whatsapp = new WhatsAppChannel(config.whatsapp, logger)
    whatsapp.onMessage(createNlpMessageHandler({
      channelName: 'WhatsApp',
      logger,
      orchestrator,
      sendText: (recipientId, text) => whatsapp!.sendMessage(recipientId, { type: 'text', text }),
      sendMessage: (recipientId, message) => whatsapp!.sendMessage(recipientId, message),
    }))
    logger.info('WhatsApp channel enabled')
  }

  if (config.instagram) {
    instagram = new InstagramChannel(config.instagram, logger)
    instagram.onMessage(createNlpMessageHandler({
      channelName: 'Instagram',
      logger,
      orchestrator,
      sendText: (recipientId, text) => instagram!.sendTextMessage(recipientId, text),
      sendMessage: (recipientId, message) => instagram!.sendMessage(recipientId, message),
    }))
    logger.info('Instagram channel enabled')
  }

  if (config.messenger) {
    messenger = new MessengerChannel(config.messenger, logger)
    messenger.onMessage(createNlpMessageHandler({
      channelName: 'Messenger',
      logger,
      orchestrator,
      sendText: (recipientId, text) => messenger!.sendText(recipientId, text),
      sendMessage: (recipientId, message) => messenger!.sendMessage(recipientId, message),
    }))
    logger.info('Messenger channel enabled')
  }

  if (config.telegram) {
    telegram = new TelegramChannel(config.telegram, logger)
    telegram.onMessage(createNlpMessageHandler({
      channelName: 'Telegram',
      logger,
      orchestrator,
      sendText: (recipientId, text) => telegram!.sendTextMessage(recipientId, text),
      sendMessage: (recipientId, message) => telegram!.sendMessage(recipientId, message),
    }))
    logger.info('Telegram channel enabled')
  }

  if (config.x) {
    x = new XChannel(config.x, logger)
    x.onMessage(createNlpMessageHandler({
      channelName: 'X',
      logger,
      orchestrator,
      sendText: (recipientId, text) => x!.sendTextMessage(recipientId, text),
    }))
    logger.info('X channel enabled')
  }

  return {
    config,
    logger,
    deduplicator,
    runtimeStore,
    orchestrator,
    nlpClient,
    whatsapp,
    instagram,
    messenger,
    telegram,
    x,
    website,
    hubspot,
  }
}
