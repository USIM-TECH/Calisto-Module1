import axios from 'axios'
import { ChatChannel, WebhookRegistrationStatus, type PrismaClient } from '@prisma/client'
import { decryptCredentials, encryptCredentials, maskSecret } from './encryption.js'
import { extractGraphApiError, validateWhatsAppAccessToken } from './webhook-utils.js'
import type {
  ChannelAccountInput,
  ChannelAccountRecord,
  ChannelAccountUpdateInput,
  ChannelCredentials,
  InstagramCredentials,
  ManagedChannel,
  MessengerCredentials,
  TelegramCredentials,
  WhatsAppCredentials,
} from './credential-types.js'

type DbRow = {
  id: string
  label: string
  channel: ChatChannel
  nativeId: string
  enabled: boolean
  credentialsEncrypted: string
  verifyToken: string | null
  metaAppId: string | null
  apiVersion: string | null
  webhookStatus: WebhookRegistrationStatus
  webhookUrl: string | null
  webhookError: string | null
  tokenExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ChannelAccountWireRecord extends ChannelAccountRecord {
  credentialsPreview: Record<string, string | undefined>
}

function toManagedChannel(channel: ChatChannel): ManagedChannel {
  if (channel === 'whatsapp' || channel === 'instagram' || channel === 'messenger' || channel === 'telegram') {
    return channel
  }
  throw new Error(`Unsupported managed channel: ${channel}`)
}

function toPrismaChannel(channel: ManagedChannel): ChatChannel {
  return channel as ChatChannel
}

function rowToRecord(row: DbRow): ChannelAccountRecord {
  return {
    id: row.id,
    label: row.label,
    channel: toManagedChannel(row.channel),
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
}

function previewCredentials(channel: ManagedChannel, credentials: ChannelCredentials): Record<string, string | undefined> {
  switch (channel) {
    case 'whatsapp': {
      const c = credentials as WhatsAppCredentials
      return {
        accessToken: maskSecret(c.accessToken),
        phoneNumberId: c.phoneNumberId,
        clientId: c.clientId,
        clientSecret: maskSecret(c.clientSecret),
        wabaId: c.wabaId,
      }
    }
    case 'instagram': {
      const c = credentials as InstagramCredentials
      return {
        accessToken: maskSecret(c.accessToken),
        instagramId: c.instagramId,
        clientId: c.clientId,
        clientSecret: maskSecret(c.clientSecret),
      }
    }
    case 'messenger': {
      const c = credentials as MessengerCredentials
      return {
        pageAccessToken: maskSecret(c.pageAccessToken),
        pageId: c.pageId,
        clientId: c.clientId,
        clientSecret: maskSecret(c.clientSecret),
        appToken: maskSecret(c.appToken),
      }
    }
    case 'telegram': {
      const c = credentials as TelegramCredentials
      return {
        botToken: maskSecret(c.botToken),
        secretToken: maskSecret(c.secretToken),
        apiBaseUrl: c.apiBaseUrl,
      }
    }
    default:
      return {}
  }
}

export class ChannelAccountStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryptionKey: string,
  ) {}

  public decryptRowCredentials(row: DbRow): ChannelCredentials {
    const json = decryptCredentials(row.credentialsEncrypted, this.encryptionKey)
    return JSON.parse(json) as ChannelCredentials
  }

  public toWire(row: DbRow): ChannelAccountWireRecord {
    const credentials = this.decryptRowCredentials(row)
    return {
      ...rowToRecord(row),
      credentialsPreview: previewCredentials(toManagedChannel(row.channel), credentials),
    }
  }

  public async list(includeDisabled = true): Promise<ChannelAccountWireRecord[]> {
    const rows = await this.prisma.channelAccount.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [{ channel: 'asc' }, { label: 'asc' }],
    })
    return rows.map((row) => this.toWire(row))
  }

  public async getById(id: string): Promise<ChannelAccountWireRecord | undefined> {
    const row = await this.prisma.channelAccount.findUnique({ where: { id } })
    return row ? this.toWire(row) : undefined
  }

  public async getEnabledRows(): Promise<DbRow[]> {
    return this.prisma.channelAccount.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  public async count(): Promise<number> {
    return this.prisma.channelAccount.count()
  }

  public async create(input: ChannelAccountInput): Promise<ChannelAccountWireRecord> {
    const nativeId = input.nativeId ?? (await resolveNativeId(input.channel, input.credentials))
    const row = await this.prisma.channelAccount.create({
      data: {
        label: input.label.trim(),
        channel: toPrismaChannel(input.channel),
        nativeId,
        enabled: true,
        credentialsEncrypted: encryptCredentials(JSON.stringify(input.credentials), this.encryptionKey),
        verifyToken: input.verifyToken?.trim() || null,
        metaAppId: input.metaAppId?.trim() || null,
        apiVersion: input.apiVersion?.trim() || null,
        webhookStatus: WebhookRegistrationStatus.pending,
      },
    })
    return this.toWire(row)
  }

  public async getDecryptedCredentials(id: string): Promise<ChannelCredentials | undefined> {
    const existing = await this.prisma.channelAccount.findUnique({ where: { id } })
    if (!existing) return undefined
    return this.decryptRowCredentials(existing)
  }

  public async update(id: string, input: ChannelAccountUpdateInput): Promise<ChannelAccountWireRecord | undefined> {
    const existing = await this.prisma.channelAccount.findUnique({ where: { id } })
    if (!existing) return undefined

    const credentials = input.credentials
      ? ({ ...this.decryptRowCredentials(existing), ...input.credentials } as ChannelCredentials)
      : this.decryptRowCredentials(existing)

    const nativeId = input.nativeId?.trim()
      ?? (input.credentials ? await resolveNativeId(toManagedChannel(existing.channel), credentials) : existing.nativeId)

    const row = await this.prisma.channelAccount.update({
      where: { id },
      data: {
        label: input.label?.trim() ?? undefined,
        nativeId,
        enabled: input.enabled,
        verifyToken: input.verifyToken !== undefined ? (input.verifyToken.trim() || null) : undefined,
        metaAppId: input.metaAppId !== undefined ? (input.metaAppId.trim() || null) : undefined,
        apiVersion: input.apiVersion !== undefined ? (input.apiVersion.trim() || null) : undefined,
        credentialsEncrypted: input.credentials
          ? encryptCredentials(JSON.stringify(input.credentials), this.encryptionKey)
          : undefined,
      },
    })
    return this.toWire(row)
  }

  public async disable(id: string): Promise<ChannelAccountWireRecord | undefined> {
    const existing = await this.prisma.channelAccount.findUnique({ where: { id } })
    if (!existing) return undefined
    const row = await this.prisma.channelAccount.update({
      where: { id },
      data: { enabled: false },
    })
    return this.toWire(row)
  }

  public async updateWebhookState(
    id: string,
    state: {
      webhookStatus: WebhookRegistrationStatus
      webhookUrl?: string | null
      webhookError?: string | null
    },
  ): Promise<void> {
    await this.prisma.channelAccount.update({
      where: { id },
      data: {
        webhookStatus: state.webhookStatus,
        webhookUrl: state.webhookUrl ?? null,
        webhookError: state.webhookError ?? null,
      },
    })
  }

  public async updateAccessToken(id: string, accessToken: string, tokenExpiresAt?: Date): Promise<void> {
    const existing = await this.prisma.channelAccount.findUnique({ where: { id } })
    if (!existing) return

    const credentials = this.decryptRowCredentials(existing)
    if (existing.channel === 'instagram') {
      ;(credentials as InstagramCredentials).accessToken = accessToken
    } else if (existing.channel === 'whatsapp') {
      ;(credentials as WhatsAppCredentials).accessToken = accessToken
    } else if (existing.channel === 'messenger') {
      ;(credentials as MessengerCredentials).pageAccessToken = accessToken
    } else {
      return
    }

    await this.prisma.channelAccount.update({
      where: { id },
      data: {
        credentialsEncrypted: encryptCredentials(JSON.stringify(credentials), this.encryptionKey),
        tokenExpiresAt: tokenExpiresAt ?? null,
      },
    })
  }
}

export async function resolveNativeId(channel: ManagedChannel, credentials: ChannelCredentials): Promise<string> {
  switch (channel) {
    case 'whatsapp': {
      const c = credentials as WhatsAppCredentials
      if (!c.phoneNumberId?.trim()) throw new Error('phoneNumberId is required for WhatsApp')
      return c.phoneNumberId.trim()
    }
    case 'instagram': {
      const c = credentials as InstagramCredentials
      if (!c.instagramId?.trim()) throw new Error('instagramId is required for Instagram')
      return c.instagramId.trim()
    }
    case 'messenger': {
      const c = credentials as MessengerCredentials
      if (!c.pageId?.trim()) throw new Error('pageId is required for Messenger')
      return c.pageId.trim()
    }
    case 'telegram': {
      const c = credentials as TelegramCredentials
      if (!c.botToken?.trim()) throw new Error('botToken is required for Telegram')
      const base = (c.apiBaseUrl?.trim() || 'https://api.telegram.org').replace(/\/$/, '')
      const { data } = await axios.get(`${base}/bot${c.botToken.trim()}/getMe`, { timeout: 10_000 })
      if (!data?.ok || !data?.result?.id) {
        throw new Error(data?.description ?? 'Telegram getMe failed')
      }
      return String(data.result.id)
    }
    default:
      throw new Error(`Unsupported channel: ${channel satisfies never}`)
  }
}

export async function validateCredentials(channel: ManagedChannel, credentials: ChannelCredentials): Promise<void> {
  switch (channel) {
    case 'whatsapp': {
      const c = credentials as WhatsAppCredentials
      if (!c.accessToken?.trim() || !c.phoneNumberId?.trim()) {
        throw new Error('WhatsApp requires accessToken and phoneNumberId')
      }
      try {
        await validateWhatsAppAccessToken(c.accessToken.trim(), c.phoneNumberId.trim(), 'v25.0')
      } catch (error) {
        throw new Error(extractGraphApiError(error))
      }
      return
    }
    case 'instagram': {
      const c = credentials as InstagramCredentials
      if (!c.accessToken?.trim() || !c.instagramId?.trim()) {
        throw new Error('Instagram requires accessToken and instagramId')
      }
      const version = 'v21.0'
      await axios.get(`https://graph.instagram.com/${version}/${c.instagramId.trim()}`, {
        params: { fields: 'id,username', access_token: c.accessToken.trim() },
        timeout: 10_000,
      })
      return
    }
    case 'messenger': {
      const c = credentials as MessengerCredentials
      if (!c.pageAccessToken?.trim() || !c.pageId?.trim()) {
        throw new Error('Messenger requires pageAccessToken and pageId')
      }
      const version = 'v23.0'
      await axios.get(`https://graph.facebook.com/${version}/${c.pageId.trim()}`, {
        params: { fields: 'id,name', access_token: c.pageAccessToken.trim() },
        timeout: 10_000,
      })
      return
    }
    case 'telegram': {
      await resolveNativeId(channel, credentials)
      return
    }
    default:
      throw new Error(`Unsupported channel: ${channel satisfies never}`)
  }
}
