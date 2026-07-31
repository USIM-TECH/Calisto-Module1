import type { CacheService } from '../cache/index.js'
import type { IncomingMessage } from '../core/types.js'
import type { Logger } from '../core/utils/index.js'
import { InstagramChannel, type InstagramConfig } from '../integrations/channels/instagram/index.js'
import { MessengerChannel, type MessengerConfig } from '../integrations/channels/messenger/index.js'
import { TelegramChannel, type TelegramConfig } from '../integrations/channels/telegram/index.js'
import { WhatsAppChannel, type WhatsAppConfig } from '../integrations/channels/whatsapp/index.js'
import { createNlpMessageHandler } from '../app/message-handler.js'
import type { LeadOrchestrator } from '../leads/index.js'
import { ChannelAccountStore } from './channel-account-store.js'
import type {
  ChannelAccountRecord,
  InstagramCredentials,
  ManagedChannel,
  MessengerCredentials,
  TelegramCredentials,
  WhatsAppCredentials,
} from './credential-types.js'

export type ManagedChannelClient = WhatsAppChannel | InstagramChannel | MessengerChannel | TelegramChannel

export interface RegisteredChannelAccount {
  record: ChannelAccountRecord
  clientSecret?: string
  client: ManagedChannelClient
}

export class ChannelAccountRegistry {
  private _accounts = new Map<string, RegisteredChannelAccount>()
  private _byNativeId = new Map<string, RegisteredChannelAccount>()

  public get size(): number {
    return this._accounts.size
  }

  public list(): RegisteredChannelAccount[] {
    return [...this._accounts.values()]
  }

  public getById(accountId: string): RegisteredChannelAccount | undefined {
    return this._accounts.get(accountId)
  }

  public getByNativeId(channel: ManagedChannel, nativeId: string): RegisteredChannelAccount | undefined {
    return this._byNativeId.get(`${channel}:${nativeId}`)
  }

  public listByChannel(channel: ManagedChannel): RegisteredChannelAccount[] {
    return this.list().filter((entry) => entry.record.channel === channel)
  }

  public replaceAll(entries: RegisteredChannelAccount[]): void {
    this._accounts.clear()
    this._byNativeId.clear()
    for (const entry of entries) {
      this._accounts.set(entry.record.id, entry)
      this._byNativeId.set(`${entry.record.channel}:${entry.record.nativeId}`, entry)
    }
  }
}

interface BuildRegistryArgs {
  store: ChannelAccountStore
  logger: Logger
  cacheService: CacheService
  orchestrator: LeadOrchestrator
  telegramAliasTtlSec: number
  onInstagramTokenRefreshed?: (accountId: string, accessToken: string, expiresAt: Date) => Promise<void>
}

function withAccountContext(message: IncomingMessage, account: RegisteredChannelAccount): IncomingMessage {
  return {
    ...message,
    accountId: account.record.id,
    accountLabel: account.record.label,
  }
}

function attachMessageHandler(
  account: RegisteredChannelAccount,
  logger: Logger,
  orchestrator: LeadOrchestrator,
  cacheService: CacheService,
): void {
  const channelNameMap = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    messenger: 'Messenger',
    telegram: 'Telegram',
  } as const

  const channelName = channelNameMap[account.record.channel]
  const handler = createNlpMessageHandler({
    channelName,
    logger,
    orchestrator,
    cacheService,
    getRecipientId: account.record.channel === 'telegram'
      ? (message) => message.conversationId
      : undefined,
    sendText: async (recipientId, text) => {
      const client = account.client
      if (client instanceof TelegramChannel) return client.sendTextMessage(recipientId, text)
      if (client instanceof WhatsAppChannel) return client.sendMessage(recipientId, { type: 'text', text })
      if (client instanceof InstagramChannel) return client.sendTextMessage(recipientId, text)
      return (client as MessengerChannel).sendText(recipientId, text)
    },
    sendMessage: async (recipientId, message) => {
      const client = account.client
      if (client instanceof TelegramChannel) return client.sendMessage(recipientId, message)
      if (client instanceof WhatsAppChannel) return client.sendMessage(recipientId, message)
      if (client instanceof InstagramChannel) return client.sendMessage(recipientId, message)
      return (client as MessengerChannel).sendMessage(recipientId, message)
    },
  })

  account.client.onMessage(async (message) => {
    await handler(withAccountContext(message, account))
  })
}

export async function buildChannelAccountRegistry(args: BuildRegistryArgs): Promise<ChannelAccountRegistry> {
  const registry = new ChannelAccountRegistry()
  const rows = await args.store.getEnabledRows()
  const entries: RegisteredChannelAccount[] = []

  for (const row of rows) {
    const credentials = args.store.decryptRowCredentials(row)
    const record: ChannelAccountRecord = {
      id: row.id,
      label: row.label,
      channel: row.channel as ManagedChannel,
      nativeId: row.nativeId,
      enabled: row.enabled,
      verifyToken: row.verifyToken ?? undefined,
      metaAppId: row.metaAppId ?? undefined,
      apiVersion: row.apiVersion ?? undefined,
      webhookStatus: row.webhookStatus,
      webhookUrl: row.webhookUrl ?? undefined,
      webhookError: row.webhookError ?? undefined,
      tokenExpiresAt: row.tokenExpiresAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }

    let client: ManagedChannelClient
    let clientSecret: string | undefined

    switch (record.channel) {
      case 'whatsapp': {
        const c = credentials as WhatsAppCredentials
        const config: WhatsAppConfig = {
          accessToken: c.accessToken,
          phoneNumberId: c.phoneNumberId,
          verifyToken: record.verifyToken ?? '',
          clientSecret: c.clientSecret,
          apiVersion: record.apiVersion,
        }
        clientSecret = c.clientSecret
        client = new WhatsAppChannel(config, args.logger)
        break
      }
      case 'instagram': {
        const c = credentials as InstagramCredentials
        const config: InstagramConfig = {
          accessToken: c.accessToken,
          instagramId: c.instagramId,
          verifyToken: record.verifyToken ?? '',
          clientId: c.clientId,
          clientSecret: c.clientSecret,
          apiVersion: record.apiVersion,
          accountId: record.id,
          onTokenRefreshed: args.onInstagramTokenRefreshed
            ? async (accessToken, expiresAt) => args.onInstagramTokenRefreshed!(record.id, accessToken, expiresAt)
            : undefined,
        }
        clientSecret = c.clientSecret
        client = new InstagramChannel(config, args.logger, args.cacheService)
        break
      }
      case 'messenger': {
        const c = credentials as MessengerCredentials
        const config: MessengerConfig = {
          pageAccessToken: c.pageAccessToken,
          pageId: c.pageId,
          verifyToken: record.verifyToken ?? '',
          clientId: c.clientId,
          clientSecret: c.clientSecret,
          appToken: c.appToken,
          apiVersion: record.apiVersion,
        }
        clientSecret = c.clientSecret
        client = new MessengerChannel(config, args.logger)
        break
      }
      case 'telegram': {
        const c = credentials as TelegramCredentials
        const config: TelegramConfig = {
          botToken: c.botToken,
          secretToken: c.secretToken,
          apiBaseUrl: c.apiBaseUrl,
        }
        client = new TelegramChannel(config, args.logger, args.cacheService, args.telegramAliasTtlSec)
        break
      }
      default:
        args.logger.warn(`Skipping unsupported channel account ${record.id}`)
        continue
    }

    const registered: RegisteredChannelAccount = { record, clientSecret, client }
    attachMessageHandler(registered, args.logger, args.orchestrator, args.cacheService)
    entries.push(registered)
    args.logger.info(`Channel account enabled: ${record.label} (${record.channel}/${record.nativeId})`)
  }

  registry.replaceAll(entries)
  return registry
}

export { registerAccountWebhook } from './webhook-registration.js'
