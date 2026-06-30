import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import type { AppConfig } from '../config/index.js'
import { loadConfig } from '../config/index.js'
import type { CacheService } from '../cache/index.js'
import { createCacheService } from '../cache/index.js'
import { ConsoleLogger, LlmIntentClassifier, NLPClient, type Logger } from '../core/utils/index.js'
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
import { getPrismaClient } from '../db/prisma.js'
import { PrismaKnowledgeChunkStore, type KnowledgeChunkStore } from '../knowledge/index.js'
import { PrismaProductStore, PrismaPresetStore, PrismaStoreStore, type PresetStore, type ProductStore, type StoreStore } from '../products/index.js'
import { createNlpMessageHandler } from './message-handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface AppDependencies {
  config: AppConfig
  logger: Logger
  cacheService: CacheService
  deduplicator: MessageDeduplicator
  runtimeStore: RuntimeStore
  productStore?: ProductStore
  presetStore?: PresetStore
  storeStore?: StoreStore
  knowledgeChunkStore?: KnowledgeChunkStore
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

export async function createDependencies(): Promise<AppDependencies> {
  loadEnvironment()

  const logger: Logger = new ConsoleLogger()
  const config = loadConfig()
  const cacheService = await createCacheService(config, logger)

  if (config.usedFileStorageFallback) {
    logger.warn(
      'STORAGE_BACKEND is mysql but DATABASE_URL is not set; falling back to file storage (runtime-store.json).',
    )
  }
  const runtimeStore = createRuntimeStore({
    backend: config.storageBackend,
    dataDir: config.dataDir,
  })
  const productStore: ProductStore | undefined =
    config.storageBackend === 'mysql'
      ? new PrismaProductStore(getPrismaClient(), cacheService, config.cache.productCatalogueTtlSec)
      : undefined
  const presetStore: PresetStore | undefined =
    config.storageBackend === 'mysql'
      ? new PrismaPresetStore(getPrismaClient(), cacheService)
      : undefined
  const storeStore: StoreStore | undefined =
    config.storageBackend === 'mysql'
      ? new PrismaStoreStore(getPrismaClient())
      : undefined
  const knowledgeChunkStore: KnowledgeChunkStore | undefined =
    config.storageBackend === 'mysql'
      ? new PrismaKnowledgeChunkStore(
          getPrismaClient(),
          cacheService,
          config.cache.knowledgeChunksTtlSec,
          config.cache.knowledgeSummaryTtlSec,
        )
      : undefined
  if (!productStore) {
    logger.warn('Product catalogue store unavailable: STORAGE_BACKEND must be mysql for /admin/products and /products/search.')
  }
  if (!storeStore) {
    logger.warn('Store store unavailable: STORAGE_BACKEND must be mysql for /stores and /admin/stores.')
  }
  if (!knowledgeChunkStore) {
    logger.warn('Knowledge chunk store unavailable: STORAGE_BACKEND must be mysql for /admin/knowledge and /knowledge/chunks.')
  }
  const deduplicator = createMessageDeduplicator(runtimeStore, config.dedupTtlMs)

  const llmClassifier = config.llm.enabled
    ? new LlmIntentClassifier(
        {
          ollamaUrl: config.llm.ollamaUrl,
          model: config.llm.model,
          timeout: config.llm.timeoutMs,
          temperature: config.llm.temperature,
        },
        logger,
      )
    : undefined

  if (llmClassifier) {
    logger.info(
      `LLM fallback classifier enabled: model=${config.llm.model} ollama=${config.llm.ollamaUrl} ` +
      `(invoked when Rasa NLU confidence < ${config.llm.nluConfidenceFloor})`,
    )
  } else {
    logger.info('LLM fallback classifier disabled (LLM_LAYER_ENABLED=false); Rasa-only mode')
  }

  const nlpClient = new NLPClient(
    {
      rasaUrl: config.rasaUrl,
      nluConfidenceFloor: config.llm.nluConfidenceFloor,
      llmConfidenceFloor: config.llm.llmConfidenceFloor,
      isolateTrackersByChannel: config.isolateTrackersByChannel,
    },
    logger,
    llmClassifier,
    cacheService,
  )

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
      cacheService,
      sendText: (recipientId, text) => whatsapp!.sendMessage(recipientId, { type: 'text', text }),
      sendMessage: (recipientId, message) => whatsapp!.sendMessage(recipientId, message),
    }))
    logger.info('WhatsApp channel enabled')
  }

  if (config.instagram) {
    instagram = new InstagramChannel(config.instagram, logger, cacheService)
    instagram.onMessage(createNlpMessageHandler({
      channelName: 'Instagram',
      logger,
      orchestrator,
      cacheService,
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
      cacheService,
      sendText: (recipientId, text) => messenger!.sendText(recipientId, text),
      sendMessage: (recipientId, message) => messenger!.sendMessage(recipientId, message),
    }))
    logger.info('Messenger channel enabled')
  }

  if (config.telegram) {
    telegram = new TelegramChannel(config.telegram, logger, cacheService, config.cache.telegramAliasTtlSec)
    telegram.onMessage(createNlpMessageHandler({
      channelName: 'Telegram',
      logger,
      orchestrator,
      cacheService,
      getRecipientId: (message) => message.conversationId,
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
      cacheService,
      sendText: (recipientId, text) => x!.sendTextMessage(recipientId, text),
      sendMessage: (recipientId, message) => x!.sendMessage(recipientId, message),
    }))
    logger.info('X channel enabled')
  }

  return {
    config,
    logger,
    cacheService,
    deduplicator,
    runtimeStore,
    productStore,
    presetStore,
    storeStore,
    knowledgeChunkStore,
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
