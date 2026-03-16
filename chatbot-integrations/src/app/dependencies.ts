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
import { createMessageDeduplicator, type MessageDeduplicator } from './message-deduplicator.js'
import { createNlpMessageHandler } from './message-handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface AppDependencies {
  config: AppConfig
  logger: Logger
  deduplicator: MessageDeduplicator
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
  const deduplicator = createMessageDeduplicator()
  const nlpClient = new NLPClient({ rasaUrl: config.rasaUrl }, logger)

  logger.info(`NLP client configured for ${config.rasaUrl}`)

  let whatsapp: WhatsAppChannel | undefined
  let instagram: InstagramChannel | undefined
  let messenger: MessengerChannel | undefined
  let telegram: TelegramChannel | undefined
  let x: XChannel | undefined
  let hubspot: HubSpotClient | undefined
  const website = new WebsiteChannel(nlpClient, logger)

  if (config.whatsapp) {
    whatsapp = new WhatsAppChannel(config.whatsapp, logger)
    whatsapp.onMessage(createNlpMessageHandler({
      channelName: 'WhatsApp',
      logger,
      nlpClient,
      sendText: (recipientId, text) => whatsapp!.sendMessage(recipientId, { type: 'text', text }),
      sendMessage: (recipientId, message) => whatsapp!.sendMessage(recipientId, message),
      deduplicator,
    }))
    logger.info('WhatsApp channel enabled')
  }

  if (config.instagram) {
    instagram = new InstagramChannel(config.instagram, logger)
    instagram.onMessage(createNlpMessageHandler({
      channelName: 'Instagram',
      logger,
      nlpClient,
      sendText: (recipientId, text) => instagram!.sendTextMessage(recipientId, text),
      sendMessage: (recipientId, message) => instagram!.sendMessage(recipientId, message),
      deduplicator,
    }))
    logger.info('Instagram channel enabled')
  }

  if (config.messenger) {
    messenger = new MessengerChannel(config.messenger, logger)
    messenger.onMessage(createNlpMessageHandler({
      channelName: 'Messenger',
      logger,
      nlpClient,
      sendText: (recipientId, text) => messenger!.sendText(recipientId, text),
      sendMessage: (recipientId, message) => messenger!.sendMessage(recipientId, message),
      deduplicator,
    }))
    logger.info('Messenger channel enabled')
  }

  if (config.telegram) {
    telegram = new TelegramChannel(config.telegram, logger)
    telegram.onMessage(createNlpMessageHandler({
      channelName: 'Telegram',
      logger,
      nlpClient,
      sendText: (recipientId, text) => telegram!.sendTextMessage(recipientId, text),
      sendMessage: (recipientId, message) => telegram!.sendMessage(recipientId, message),
      deduplicator,
    }))
    logger.info('Telegram channel enabled')
  }

  if (config.x) {
    x = new XChannel(config.x, logger)
    x.onMessage(createNlpMessageHandler({
      channelName: 'X',
      logger,
      nlpClient,
      sendText: (recipientId, text) => x!.sendTextMessage(recipientId, text),
      deduplicator,
    }))
    logger.info('X channel enabled')
  }

  if (config.hubspot) {
    hubspot = new HubSpotClient(config.hubspot, logger)
    logger.info('HubSpot client enabled')
  }

  return {
    config,
    logger,
    deduplicator,
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
