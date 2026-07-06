import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import type { AppConfig } from '../config/index.js'
import { loadConfig } from '../config/index.js'
import type { CacheService } from '../cache/index.js'
import { createCacheService } from '../cache/index.js'
import {
  ChannelAccountService,
  ChannelAccountStore,
  seedChannelAccountsFromEnv,
} from '../channel-accounts/index.js'
import { ConsoleLogger, LlmIntentClassifier, NLPClient, type Logger } from '../core/utils/index.js'
import { XChannel } from '../integrations/channels/x/index.js'
import { WebsiteChannel } from '../integrations/channels/website/index.js'
import { HubSpotClient } from '../integrations/crm/hubspot/index.js'
import { createNlpMessageHandler } from './message-handler.js'
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
  channelAccountService?: ChannelAccountService
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

  let x: XChannel | undefined
  let hubspot: HubSpotClient | undefined
  let channelAccountService: ChannelAccountService | undefined

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

  if (config.storageBackend === 'mysql') {
    if (!config.channelCredentialsEncryptionKey) {
      logger.warn('CHANNEL_CREDENTIALS_ENCRYPTION_KEY is not set — channel accounts are disabled until it is configured.')
    } else {
      const store = new ChannelAccountStore(getPrismaClient(), config.channelCredentialsEncryptionKey)
      const imported = await seedChannelAccountsFromEnv(config.channelCredentialsEncryptionKey)
      if (imported > 0) {
        logger.info(`Imported ${imported} channel account(s) from .env into the database`)
      }
      channelAccountService = new ChannelAccountService(
        store,
        logger,
        cacheService,
        orchestrator,
        config.cache.telegramAliasTtlSec,
        config.publicBaseUrl,
      )
      await channelAccountService.initialize()
      logger.info(`Channel account registry loaded (${channelAccountService.registry.size} enabled account(s))`)
    }
  } else {
    logger.warn('Channel accounts require STORAGE_BACKEND=mysql')
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
    channelAccountService,
    x,
    website,
    hubspot,
  }
}
