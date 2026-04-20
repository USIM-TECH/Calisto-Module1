import crypto from 'crypto'
import {
  ChatChannel,
  CrmStatus,
  MessageDirection,
  Prisma,
  PrismaClient,
  QualificationStatus,
  ResponseStyle,
  WebhookDirection,
} from '@prisma/client'
import { parseMessageTimestampToDate } from '../../core/utils/helpers.js'
import type { IncomingMessage } from '../../core/types.js'
import type { LeadUpdatePayload, RuntimeStore, RuntimeStoreSummary } from './runtime-store.interface.js'
import type {
  ConversationMessageRecord,
  ConversationRecord,
  LeadRecord,
  WebhookEventRecord,
} from '../types/records.js'

const WEBHOOK_EVENT_CAP = 999

function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function toPrismaChannel(channel: IncomingMessage['channel']): ChatChannel {
  return channel as ChatChannel
}

function leadToRecord(row: {
  id: string
  channel: ChatChannel
  sourceId: string
  conversationId: string
  responseStyle: ResponseStyle | null
  senderName: string | null
  leadName: string | null
  email: string | null
  phone: string | null
  preferredService: string | null
  location: string | null
  qualificationStatus: QualificationStatus
  crmStatus: CrmStatus
  crmRecordId: string | null
  lastIntent: string | null
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}): LeadRecord {
  return {
    id: row.id,
    channel: row.channel as LeadRecord['channel'],
    sourceId: row.sourceId,
    conversationId: row.conversationId,
    responseStyle: row.responseStyle ?? undefined,
    senderName: row.senderName ?? undefined,
    leadName: row.leadName ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    preferredService: row.preferredService ?? undefined,
    location: row.location ?? undefined,
    qualificationStatus: row.qualificationStatus as LeadRecord['qualificationStatus'],
    crmStatus: row.crmStatus as LeadRecord['crmStatus'],
    crmRecordId: row.crmRecordId ?? undefined,
    lastIntent: row.lastIntent ?? undefined,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function messageToRecord(m: {
  direction: MessageDirection
  messageId: string
  text: string | null
  messageType: string
  timestamp: Date
  metadata: Prisma.JsonValue
}): ConversationMessageRecord {
  return {
    direction: m.direction === MessageDirection.inbound ? 'inbound' : 'outbound',
    messageId: m.messageId,
    text: m.text ?? undefined,
    messageType: m.messageType,
    timestamp: m.timestamp.toISOString(),
    metadata: m.metadata as ConversationMessageRecord['metadata'],
  }
}

function conversationToRecord(row: {
  id: string
  leadId: string
  channel: ChatChannel
  sourceId: string
  createdAt: Date
  updatedAt: Date
  messages: Array<{
    direction: MessageDirection
    messageId: string
    text: string | null
    messageType: string
    timestamp: Date
    metadata: Prisma.JsonValue
  }>
}): ConversationRecord {
  return {
    id: row.id,
    leadId: row.leadId,
    channel: row.channel as ConversationRecord['channel'],
    sourceId: row.sourceId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map(messageToRecord),
  }
}

function webhookToRecord(row: {
  id: string
  channel: ChatChannel
  direction: WebhookDirection
  path: string
  sourceId: string
  conversationId: string
  leadId: string | null
  receivedAt: Date
  payload: Prisma.JsonValue
}): WebhookEventRecord {
  return {
    id: row.id,
    channel: row.channel as WebhookEventRecord['channel'],
    direction: row.direction === WebhookDirection.inbound ? 'inbound' : 'outbound',
    path: row.path,
    sourceId: row.sourceId,
    conversationId: row.conversationId,
    leadId: row.leadId ?? undefined,
    receivedAt: row.receivedAt.toISOString(),
    payload: row.payload as unknown,
  }
}

function buildLeadUpdate(snapshot: LeadUpdatePayload): Prisma.LeadUpdateInput {
  const data: Prisma.LeadUpdateInput = {}
  if (snapshot.senderName !== undefined) {
    data.senderName = snapshot.senderName
  }
  if (snapshot.leadName !== undefined) {
    data.leadName = snapshot.leadName
  }
  if (snapshot.email !== undefined) {
    data.email = snapshot.email
  }
  if (snapshot.phone !== undefined) {
    data.phone = snapshot.phone
  }
  if (snapshot.preferredService !== undefined) {
    data.preferredService = snapshot.preferredService
  }
  if (snapshot.location !== undefined) {
    data.location = snapshot.location
  }
  if (snapshot.responseStyle !== undefined) {
    data.responseStyle = snapshot.responseStyle as ResponseStyle
  }
  if (snapshot.qualificationStatus !== undefined) {
    data.qualificationStatus = snapshot.qualificationStatus as QualificationStatus
  }
  if (snapshot.lastIntent !== undefined) {
    data.lastIntent = snapshot.lastIntent
  }
  if (snapshot.crmStatus !== undefined) {
    data.crmStatus = snapshot.crmStatus as CrmStatus
  }
  if (snapshot.crmRecordId !== undefined) {
    data.crmRecordId = snapshot.crmRecordId
  }
  if (snapshot.conversationId !== undefined) {
    data.conversationId = snapshot.conversationId
  }
  if (snapshot.lastMessageAt !== undefined) {
    data.lastMessageAt = parseMessageTimestampToDate(snapshot.lastMessageAt)
  }
  return data
}

export class PrismaRuntimeStore implements RuntimeStore {
  constructor(private readonly _prisma: PrismaClient) {}

  public async shouldProcessDeduplication(key: string, ttlMs: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - ttlMs)
    return this._prisma.$transaction(async (tx) => {
      await tx.dedupeKey.deleteMany({ where: { seenAt: { lt: cutoff } } })
      try {
        await tx.dedupeKey.create({
          data: { key, seenAt: new Date() },
        })
        return true
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
        ) {
          return false
        }
        throw error
      }
    })
  }

  public async getOrCreateLead(message: IncomingMessage): Promise<LeadRecord> {
    const sourceId = message.sourceId ?? message.senderId
    const channel = toPrismaChannel(message.channel)
    const timestamp = parseMessageTimestampToDate(message.timestamp)
    const now = new Date()

    const row = await this._prisma.lead.upsert({
      where: {
        channel_sourceId: { channel, sourceId },
      },
      create: {
        id: nextId('lead'),
        channel,
        sourceId,
        conversationId: message.conversationId,
        senderName: message.senderName,
        qualificationStatus: QualificationStatus.new,
        crmStatus: CrmStatus.pending,
        lastMessageAt: timestamp,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        senderName: message.senderName ?? undefined,
        conversationId: message.conversationId,
        lastMessageAt: timestamp,
        updatedAt: now,
      },
    })

    return leadToRecord(row)
  }

  public async updateLead(leadId: string, snapshot: LeadUpdatePayload): Promise<LeadRecord | undefined> {
    const data = buildLeadUpdate(snapshot)
    if (Object.keys(data).length === 0) {
      const row = await this._prisma.lead.findUnique({ where: { id: leadId } })
      return row ? leadToRecord(row) : undefined
    }

    data.updatedAt = new Date()

    try {
      const row = await this._prisma.lead.update({
        where: { id: leadId },
        data,
      })
      return leadToRecord(row)
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2025'
      ) {
        return undefined
      }
      throw error
    }
  }

  public async appendConversationMessage(
    leadId: string,
    message: ConversationMessageRecord,
    channel: IncomingMessage['channel'],
    sourceId: string,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const prismaChannel = toPrismaChannel(channel)
    const direction = message.direction === 'inbound'
      ? MessageDirection.inbound
      : MessageDirection.outbound
    const ts = parseMessageTimestampToDate(message.timestamp)
    const now = new Date()
    const metadata = message.metadata as Prisma.InputJsonValue

    return this._prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { timestamp: 'asc' } } },
      })

      if (existing) {
        await tx.conversationMessage.create({
          data: {
            conversationId,
            direction,
            messageId: message.messageId,
            text: message.text,
            messageType: message.messageType,
            timestamp: ts,
            metadata,
          },
        })
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: now },
        })
        const full = await tx.conversation.findUniqueOrThrow({
          where: { id: conversationId },
          include: { messages: { orderBy: { timestamp: 'asc' } } },
        })
        return conversationToRecord(full)
      }

      const created = await tx.conversation.create({
        data: {
          id: conversationId,
          leadId,
          channel: prismaChannel,
          sourceId,
          createdAt: now,
          updatedAt: now,
          messages: {
            create: [
              {
                direction,
                messageId: message.messageId,
                text: message.text,
                messageType: message.messageType,
                timestamp: ts,
                metadata,
              },
            ],
          },
        },
        include: { messages: { orderBy: { timestamp: 'asc' } } },
      })

      return conversationToRecord(created)
    })
  }

  public async appendWebhookEvent(
    event: Omit<WebhookEventRecord, 'id' | 'receivedAt'>,
  ): Promise<WebhookEventRecord> {
    const id = nextId('evt')
    const receivedAt = new Date()

    const row = await this._prisma.$transaction(async (tx) => {
      const created = await tx.webhookEvent.create({
        data: {
          id,
          channel: event.channel as ChatChannel,
          direction: event.direction === 'inbound'
            ? WebhookDirection.inbound
            : WebhookDirection.outbound,
          path: event.path,
          sourceId: event.sourceId,
          conversationId: event.conversationId,
          leadId: event.leadId,
          receivedAt,
          payload: event.payload as Prisma.InputJsonValue,
        },
      })

      const total = await tx.webhookEvent.count()
      const excess = total - WEBHOOK_EVENT_CAP
      if (excess > 0) {
        const victims = await tx.webhookEvent.findMany({
          orderBy: { receivedAt: 'asc' },
          take: excess,
          select: { id: true },
        })
        await tx.webhookEvent.deleteMany({
          where: { id: { in: victims.map((v) => v.id) } },
        })
      }

      return created
    })

    return webhookToRecord(row)
  }

  public async getSummary(): Promise<RuntimeStoreSummary> {
    const [total, qualified, pendingSync, conversations, webhookEvents, channelGroups] = await Promise.all([
      this._prisma.lead.count(),
      this._prisma.lead.count({ where: { qualificationStatus: QualificationStatus.qualified } }),
      this._prisma.lead.count({ where: { crmStatus: { not: CrmStatus.synced } } }),
      this._prisma.conversation.count(),
      this._prisma.webhookEvent.count(),
      this._prisma.lead.groupBy({
        by: ['channel'],
        _count: { channel: true },
      }),
    ])

    const channels: Record<string, number> = {}
    for (const row of channelGroups) {
      channels[row.channel] = row._count.channel
    }

    return {
      leads: {
        total,
        qualified,
        pendingSync,
      },
      conversations,
      webhookEvents,
      channels,
    }
  }

  public async listLeads(): Promise<LeadRecord[]> {
    const rows = await this._prisma.lead.findMany({
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(leadToRecord)
  }

  public async listConversations(): Promise<ConversationRecord[]> {
    const rows = await this._prisma.conversation.findMany({
      include: { messages: { orderBy: { timestamp: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(conversationToRecord)
  }
}
