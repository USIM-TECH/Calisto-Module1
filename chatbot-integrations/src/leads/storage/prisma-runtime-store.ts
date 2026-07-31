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
import type {
  CustomerSnapshot,
  IdentitySnapshot,
  MergeContact,
  ResolvedIdentity,
  RuntimeStore,
  RuntimeStoreSummary,
} from './runtime-store.interface.js'
import type {
  ChannelIdentityRecord,
  ConversationMessageRecord,
  ConversationRecord,
  CurrentInterestRecord,
  CustomerRecord,
  InterestKind,
  InterestRecord,
  SupportCaseRecord,
  WebhookEventRecord,
} from '../types/records.js'
import { normaliseEmail, normalisePhone } from './helpers.js'

const WEBHOOK_EVENT_CAP = 999

function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function toPrismaChannel(channel: IncomingMessage['channel']): ChatChannel {
  return channel as ChatChannel
}

type PrismaCustomer = {
  id: string
  leadName: string | null
  email: string | null
  phone: string | null
  location: string | null
  preferredService: string | null
  responseStyle: ResponseStyle | null
  qualificationStatus: QualificationStatus
  crmStatus: CrmStatus
  crmRecordId: string | null
  lastIntent: string | null
  lastMessageAt: Date
  firstSeenAt: Date
  updatedAt: Date
}

function customerToRecord(row: PrismaCustomer): CustomerRecord {
  return {
    id: row.id,
    leadName: row.leadName ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    location: row.location ?? undefined,
    preferredService: row.preferredService ?? undefined,
    responseStyle: row.responseStyle ?? undefined,
    qualificationStatus: row.qualificationStatus as CustomerRecord['qualificationStatus'],
    crmStatus: row.crmStatus as CustomerRecord['crmStatus'],
    crmRecordId: row.crmRecordId ?? undefined,
    lastIntent: row.lastIntent ?? undefined,
    lastMessageAt: row.lastMessageAt.toISOString(),
    firstSeenAt: row.firstSeenAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type PrismaIdentity = {
  id: string
  customerId: string
  channel: ChatChannel
  sourceId: string
  channelAccountId: string | null
  senderName: string | null
  username: string | null
  conversationId: string
  firstSeenAt: Date
  lastSeenAt: Date
  channelAccount?: { label: string } | null
}

function identityToRecord(row: PrismaIdentity): ChannelIdentityRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    channel: row.channel as ChannelIdentityRecord['channel'],
    sourceId: row.sourceId,
    channelAccountId: row.channelAccountId ?? undefined,
    accountLabel: row.channelAccount?.label,
    senderName: row.senderName ?? undefined,
    username: row.username ?? undefined,
    conversationId: row.conversationId,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  }
}

function interestToRecord(row: { id: string; customerId: string; kind: string; value: string; capturedAt: Date }): InterestRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    kind: row.kind,
    value: row.value,
    capturedAt: row.capturedAt.toISOString(),
  }
}

function currentInterestToRecord(row: { id: string; customerId: string; kind: string; value: string; createdAt: Date; updatedAt: Date }): CurrentInterestRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    kind: row.kind,
    value: row.value,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function supportCaseToRecord(row: { id: string; customerId: string; caseType: string; status: string; createdAt: Date; updatedAt: Date }): SupportCaseRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    caseType: row.caseType,
    status: row.status,
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
    metadata: m.metadata as unknown as ConversationMessageRecord['metadata'],
  }
}

function conversationToRecord(row: {
  id: string
  customerId: string
  channelIdentityId: string
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
    customerId: row.customerId,
    channelIdentityId: row.channelIdentityId,
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
  customerId: string | null
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
    customerId: row.customerId ?? undefined,
    receivedAt: row.receivedAt.toISOString(),
    payload: row.payload as unknown,
  }
}

function buildCustomerUpdate(snapshot: CustomerSnapshot): Prisma.CustomerUpdateInput {
  const data: Prisma.CustomerUpdateInput = {}
  if (snapshot.leadName !== undefined) data.leadName = snapshot.leadName
  if (snapshot.email !== undefined) data.email = snapshot.email
  if (snapshot.phone !== undefined) data.phone = snapshot.phone
  if (snapshot.location !== undefined) data.location = snapshot.location
  if (snapshot.preferredService !== undefined) data.preferredService = snapshot.preferredService
  if (snapshot.responseStyle !== undefined) data.responseStyle = snapshot.responseStyle as ResponseStyle
  if (snapshot.qualificationStatus !== undefined) data.qualificationStatus = snapshot.qualificationStatus as QualificationStatus
  if (snapshot.crmStatus !== undefined) data.crmStatus = snapshot.crmStatus as CrmStatus
  if (snapshot.crmRecordId !== undefined) data.crmRecordId = snapshot.crmRecordId
  if (snapshot.lastIntent !== undefined) data.lastIntent = snapshot.lastIntent
  if (snapshot.lastMessageAt !== undefined) data.lastMessageAt = parseMessageTimestampToDate(snapshot.lastMessageAt)
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
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return false
        }
        throw error
      }
    })
  }

  public async resolveIdentity(message: IncomingMessage, identityUpdate?: IdentitySnapshot): Promise<ResolvedIdentity> {
    const sourceId = message.sourceId ?? message.senderId
    const channel = toPrismaChannel(message.channel)
    const channelAccountId = message.accountId ?? null
    const messageTs = parseMessageTimestampToDate(message.timestamp)
    const now = new Date()

    return this._prisma.$transaction(async (tx) => {
      const existing = channelAccountId
        ? await tx.channelIdentity.findUnique({
            where: {
              channel_sourceId_channelAccountId: {
                channel,
                sourceId,
                channelAccountId,
              },
            },
            include: { customer: true, channelAccount: true },
          })
        : await tx.channelIdentity.findFirst({
            where: { channel, sourceId, channelAccountId: null },
            include: { customer: true, channelAccount: true },
          })

      if (existing) {
        const senderName = identityUpdate?.senderName ?? message.senderName ?? existing.senderName ?? undefined
        const username = identityUpdate?.username ?? message.username ?? existing.username ?? undefined
        const conversationId = identityUpdate?.conversationId ?? message.conversationId

        const updatedIdentity = await tx.channelIdentity.update({
          where: { id: existing.id },
          data: {
            senderName,
            username,
            conversationId,
            lastSeenAt: now,
          },
          include: { channelAccount: true },
        })

        const updatedCustomer = await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            lastMessageAt: messageTs,
            updatedAt: now,
          },
        })

        return {
          customer: customerToRecord(updatedCustomer),
          identity: identityToRecord(updatedIdentity),
        }
      }

      const customer = await tx.customer.create({
        data: {
          id: nextId('cust'),
          qualificationStatus: QualificationStatus.new,
          crmStatus: CrmStatus.pending,
          lastMessageAt: messageTs,
          firstSeenAt: now,
          updatedAt: now,
        },
      })

      const identity = await tx.channelIdentity.create({
        data: {
          id: nextId('cid'),
          customerId: customer.id,
          channel,
          sourceId,
          channelAccountId,
          senderName: identityUpdate?.senderName ?? message.senderName ?? null,
          username: identityUpdate?.username ?? message.username ?? null,
          conversationId: identityUpdate?.conversationId ?? message.conversationId,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        include: { channelAccount: true },
      })

      return {
        customer: customerToRecord(customer),
        identity: identityToRecord(identity),
      }
    })
  }

  public async updateCustomer(customerId: string, snapshot: CustomerSnapshot): Promise<CustomerRecord | undefined> {
    const data = buildCustomerUpdate(snapshot)
    if (Object.keys(data).length === 0) {
      const row = await this._prisma.customer.findUnique({ where: { id: customerId } })
      return row ? customerToRecord(row) : undefined
    }

    data.updatedAt = new Date()

    try {
      const row = await this._prisma.customer.update({
        where: { id: customerId },
        data,
      })
      return customerToRecord(row)
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined
      }
      throw error
    }
  }

  public async mergeCustomersByContact(customerId: string, contact: MergeContact): Promise<string> {
    const phone = normalisePhone(contact.phone)
    const email = normaliseEmail(contact.email)
    if (!phone && !email) {
      return customerId
    }

    return this._prisma.$transaction(async (tx) => {
      const orFilters: Prisma.CustomerWhereInput[] = []
      if (phone) orFilters.push({ phone })
      if (email) orFilters.push({ email })

      const candidate = await tx.customer.findFirst({
        where: {
          AND: [
            { id: { not: customerId } },
            { OR: orFilters },
          ],
        },
        orderBy: { firstSeenAt: 'asc' },
      })

      if (!candidate) {
        return customerId
      }

      const survivor = candidate
      const losing = await tx.customer.findUnique({ where: { id: customerId } })
      if (!losing) {
        return survivor.id
      }

      await tx.channelIdentity.updateMany({
        where: { customerId: losing.id },
        data: { customerId: survivor.id },
      })
      await tx.conversation.updateMany({
        where: { customerId: losing.id },
        data: { customerId: survivor.id },
      })
      await tx.webhookEvent.updateMany({
        where: { customerId: losing.id },
        data: { customerId: survivor.id },
      })

      const losingInterests = await tx.interest.findMany({ where: { customerId: losing.id } })
      for (const i of losingInterests) {
        await tx.interest.upsert({
          where: { customerId_kind_value: { customerId: survivor.id, kind: i.kind, value: i.value } },
          create: {
            customerId: survivor.id,
            kind: i.kind,
            value: i.value,
            capturedAt: i.capturedAt,
          },
          update: {},
        })
      }
      await tx.interest.deleteMany({ where: { customerId: losing.id } })
      
      const losingCurrentInterests = await tx.currentInterest.findMany({ where: { customerId: losing.id } })
      for (const i of losingCurrentInterests) {
        await tx.currentInterest.upsert({
          where: { customerId_kind: { customerId: survivor.id, kind: i.kind } },
          create: {
            customerId: survivor.id,
            kind: i.kind,
            value: i.value,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt,
          },
          update: {
            value: i.value,
            updatedAt: new Date(),
          },
        })
      }
      await tx.currentInterest.deleteMany({ where: { customerId: losing.id } })

      await tx.supportCase.updateMany({
        where: { customerId: losing.id },
        data: { customerId: survivor.id },
      })

      await tx.customer.update({
        where: { id: survivor.id },
        data: {
          leadName: survivor.leadName ?? losing.leadName,
          phone: survivor.phone ?? losing.phone,
          email: survivor.email ?? losing.email,
          location: survivor.location ?? losing.location,
          preferredService: survivor.preferredService ?? losing.preferredService,
          responseStyle: survivor.responseStyle ?? losing.responseStyle,
          crmRecordId: survivor.crmRecordId ?? losing.crmRecordId,
          lastIntent: losing.lastIntent ?? survivor.lastIntent,
          lastMessageAt:
            losing.lastMessageAt > survivor.lastMessageAt
              ? losing.lastMessageAt
              : survivor.lastMessageAt,
          updatedAt: new Date(),
        },
      })

      await tx.customer.delete({ where: { id: losing.id } })
      return survivor.id
    })
  }

  public async appendInterest(
    customerId: string,
    kind: InterestKind | string,
    value: string,
  ): Promise<InterestRecord | undefined> {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    try {
      const row = await this._prisma.interest.upsert({
        where: { customerId_kind_value: { customerId, kind, value: trimmed } },
        create: {
          customerId,
          kind,
          value: trimmed,
          capturedAt: new Date(),
        },
        update: {},
      })
      return interestToRecord(row)
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return undefined
      }
      throw error
    }
  }

  public async appendCurrentInterest(
    customerId: string,
    kind: InterestKind | string,
    value: string,
  ): Promise<CurrentInterestRecord | undefined> {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    try {
      const row = await this._prisma.currentInterest.upsert({
        where: { customerId_kind: { customerId, kind } },
        create: {
          customerId,
          kind,
          value: trimmed,
        },
        update: {
          value: trimmed,
        },
      })
      return currentInterestToRecord(row)
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return undefined
      }
      throw error
    }
  }

  public async createSupportCase(
    customerId: string,
    caseType: string,
    status: string = 'pending',
    id?: string,
  ): Promise<SupportCaseRecord> {
    const data: Prisma.SupportCaseUncheckedCreateInput = {
      customerId,
      caseType,
      status,
    }
    if (id) {
      data.id = id
    }
    const row = await this._prisma.supportCase.create({
      data,
    })
    return supportCaseToRecord(row)
  }

  public async getSupportCase(supportCaseId: string): Promise<SupportCaseRecord | undefined> {
    const row = await this._prisma.supportCase.findUnique({
      where: { id: supportCaseId },
    })
    return row ? supportCaseToRecord(row) : undefined
  }

  public async updateSupportCaseStatus(
    supportCaseId: string,
    status: string,
  ): Promise<SupportCaseRecord | undefined> {
    try {
      const row = await this._prisma.supportCase.update({
        where: { id: supportCaseId },
        data: { status },
      })
      return supportCaseToRecord(row)
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined
      }
      throw error
    }
  }

  public async appendConversationMessage(
    customerId: string,
    channelIdentityId: string,
    message: ConversationMessageRecord,
    channel: IncomingMessage['channel'],
    sourceId: string,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const prismaChannel = toPrismaChannel(channel)
    const direction = message.direction === 'inbound' ? MessageDirection.inbound : MessageDirection.outbound
    const ts = parseMessageTimestampToDate(message.timestamp)
    const now = new Date()
    const metadata = message.metadata as unknown as Prisma.InputJsonValue

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
          data: {
            updatedAt: now,
            customerId,
            channelIdentityId,
          },
        })
        // Build the result from already-fetched data to avoid a third
        // round-trip that can breach the transaction timeout.
        const newMsg = {
          direction,
          messageId: message.messageId,
          text: message.text ?? null,
          messageType: message.messageType,
          timestamp: ts,
          metadata: metadata as Prisma.JsonValue,
        }
        const allMessages = [
          ...existing.messages,
          newMsg,
        ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        return conversationToRecord({
          ...existing,
          customerId,
          channelIdentityId,
          updatedAt: now,
          messages: allMessages,
        })
      }

      const created = await tx.conversation.create({
        data: {
          id: conversationId,
          customerId,
          channelIdentityId,
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
          direction: event.direction === 'inbound' ? WebhookDirection.inbound : WebhookDirection.outbound,
          path: event.path,
          sourceId: event.sourceId,
          conversationId: event.conversationId,
          customerId: event.customerId,
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
    const [total, qualified, pendingSync, conversations, webhookEvents, identities, channelGroups] =
      await Promise.all([
        this._prisma.customer.count(),
        this._prisma.customer.count({ where: { qualificationStatus: QualificationStatus.qualified } }),
        this._prisma.customer.count({ where: { crmStatus: { not: CrmStatus.synced } } }),
        this._prisma.conversation.count(),
        this._prisma.webhookEvent.count(),
        this._prisma.channelIdentity.count(),
        this._prisma.channelIdentity.groupBy({
          by: ['channel'],
          _count: { channel: true },
        }),
      ])

    const channels: Record<string, number> = {}
    for (const row of channelGroups) {
      channels[row.channel] = row._count.channel
    }

    return {
      customers: { total, qualified, pendingSync },
      conversations,
      webhookEvents,
      channels,
      identities,
    }
  }

  public async listCustomers(): Promise<CustomerRecord[]> {
    const rows = await this._prisma.customer.findMany({
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(customerToRecord)
  }

  public async listIdentities(): Promise<ChannelIdentityRecord[]> {
    const rows = await this._prisma.channelIdentity.findMany({
      include: { channelAccount: true },
      orderBy: { lastSeenAt: 'desc' },
    })
    return rows.map(identityToRecord)
  }

  public async listConversations(): Promise<ConversationRecord[]> {
    const rows = await this._prisma.conversation.findMany({
      include: { messages: { orderBy: { timestamp: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(conversationToRecord)
  }

  public async listInterestsByCustomer(customerId: string): Promise<InterestRecord[]> {
    const rows = await this._prisma.interest.findMany({
      where: { customerId },
      orderBy: { capturedAt: 'asc' },
    })
    return rows.map(interestToRecord)
  }

  public async getCustomer(customerId: string): Promise<CustomerRecord | undefined> {
    const row = await this._prisma.customer.findUnique({ where: { id: customerId } })
    return row ? customerToRecord(row) : undefined
  }
}
