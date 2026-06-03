import crypto from 'crypto'
import path from 'path'
import type { IncomingMessage } from '../../core/types.js'
import { FileJsonStore } from './file-json-store.js'
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
  RuntimeDataShape,
  SupportCaseRecord,
  WebhookEventRecord,
} from '../types/records.js'
import { normaliseEmail, normalisePhone } from './helpers.js'

function nowIso(): string {
  return new Date().toISOString()
}

function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export class FileRuntimeStore implements RuntimeStore {
  private readonly _store: FileJsonStore<RuntimeDataShape>

  constructor(baseDir: string) {
    this._store = new FileJsonStore<RuntimeDataShape>(path.join(baseDir, 'runtime-store.json'), {
      customers: [],
      identities: [],
      interests: [],
      currentInterests: [],
      supportCases: [],
      conversations: [],
      webhookEvents: [],
      deduplication: [],
    })
  }

  public async shouldProcessDeduplication(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now()
    let shouldProcess = true

    this._store.update((state) => {
      const deduplication = state.deduplication.filter((entry) => now - entry.seenAt <= ttlMs)
      if (deduplication.some((entry) => entry.key === key)) {
        shouldProcess = false
        return { ...state, deduplication }
      }

      deduplication.push({ key, seenAt: now })
      return { ...state, deduplication }
    })

    return shouldProcess
  }

  public async resolveIdentity(message: IncomingMessage, identityUpdate?: IdentitySnapshot): Promise<ResolvedIdentity> {
    const sourceId = message.sourceId ?? message.senderId
    const timestamp = nowIso()
    let result!: ResolvedIdentity

    this._store.update((state) => {
      const existing = state.identities.find(
        (entry) => entry.channel === message.channel && entry.sourceId === sourceId,
      )

      if (existing) {
        const customer = state.customers.find((c) => c.id === existing.customerId)
        if (!customer) {
          throw new Error(`Channel identity ${existing.id} references missing customer ${existing.customerId}`)
        }

        const updatedIdentity: ChannelIdentityRecord = {
          ...existing,
          senderName: identityUpdate?.senderName ?? message.senderName ?? existing.senderName,
          username: identityUpdate?.username ?? message.username ?? existing.username,
          conversationId: identityUpdate?.conversationId ?? message.conversationId,
          lastSeenAt: timestamp,
        }
        const updatedCustomer: CustomerRecord = {
          ...customer,
          lastMessageAt: message.timestamp,
          updatedAt: timestamp,
        }

        result = { customer: updatedCustomer, identity: updatedIdentity }

        return {
          ...state,
          identities: state.identities.map((entry) => (entry.id === existing.id ? updatedIdentity : entry)),
          customers: state.customers.map((entry) => (entry.id === customer.id ? updatedCustomer : entry)),
        }
      }

      const newCustomer: CustomerRecord = {
        id: nextId('cust'),
        qualificationStatus: 'new',
        crmStatus: 'pending',
        lastMessageAt: message.timestamp,
        firstSeenAt: timestamp,
        updatedAt: timestamp,
      }
      const newIdentity: ChannelIdentityRecord = {
        id: nextId('cid'),
        customerId: newCustomer.id,
        channel: message.channel,
        sourceId,
        senderName: identityUpdate?.senderName ?? message.senderName,
        username: identityUpdate?.username ?? message.username,
        conversationId: identityUpdate?.conversationId ?? message.conversationId,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
      }
      result = { customer: newCustomer, identity: newIdentity }

      return {
        ...state,
        customers: [...state.customers, newCustomer],
        identities: [...state.identities, newIdentity],
      }
    })

    return result
  }

  public async updateCustomer(customerId: string, snapshot: CustomerSnapshot): Promise<CustomerRecord | undefined> {
    const timestamp = nowIso()
    let next: CustomerRecord | undefined

    this._store.update((state) => {
      const current = state.customers.find((c) => c.id === customerId)
      if (!current) return state

      next = {
        ...current,
        ...snapshot,
        lastMessageAt: snapshot.lastMessageAt ?? current.lastMessageAt,
        updatedAt: timestamp,
      }

      return {
        ...state,
        customers: state.customers.map((entry) => (entry.id === customerId ? next! : entry)),
      }
    })

    return next
  }

  public async mergeCustomersByContact(customerId: string, contact: MergeContact): Promise<string> {
    const phone = normalisePhone(contact.phone)
    const email = normaliseEmail(contact.email)
    if (!phone && !email) return customerId

    let resolvedId = customerId

    this._store.update((state) => {
      const losing = state.customers.find((c) => c.id === customerId)
      if (!losing) return state

      const survivor = state.customers.find((c) => {
        if (c.id === customerId) return false
        if (phone && normalisePhone(c.phone) === phone) return true
        if (email && normaliseEmail(c.email) === email) return true
        return false
      })

      if (!survivor) return state

      const winner = survivor.firstSeenAt <= losing.firstSeenAt ? survivor : losing
      const loser = winner === survivor ? losing : survivor

      const merged: CustomerRecord = {
        ...winner,
        leadName: winner.leadName ?? loser.leadName,
        phone: winner.phone ?? loser.phone,
        email: winner.email ?? loser.email,
        location: winner.location ?? loser.location,
        preferredService: winner.preferredService ?? loser.preferredService,
        responseStyle: winner.responseStyle ?? loser.responseStyle,
        crmRecordId: winner.crmRecordId ?? loser.crmRecordId,
        lastIntent: loser.lastIntent ?? winner.lastIntent,
        lastMessageAt:
          loser.lastMessageAt > winner.lastMessageAt ? loser.lastMessageAt : winner.lastMessageAt,
        updatedAt: nowIso(),
      }
      resolvedId = merged.id

      const interestsKept: InterestRecord[] = []
      const seen = new Set<string>()
      for (const interest of state.interests) {
        if (interest.customerId === winner.id || interest.customerId === loser.id) {
          const key = `${interest.kind}::${interest.value}`
          if (seen.has(key)) continue
          seen.add(key)
          interestsKept.push({ ...interest, customerId: merged.id })
        } else {
          interestsKept.push(interest)
        }
      }

      return {
        ...state,
        customers: state.customers
          .filter((c) => c.id !== loser.id)
          .map((c) => (c.id === merged.id ? merged : c)),
        identities: state.identities.map((i) =>
          i.customerId === loser.id ? { ...i, customerId: merged.id } : i,
        ),
        conversations: state.conversations.map((c) =>
          c.customerId === loser.id ? { ...c, customerId: merged.id } : c,
        ),
        interests: interestsKept,
        currentInterests: state.currentInterests.map((ci) =>
          ci.customerId === loser.id ? { ...ci, customerId: merged.id } : ci,
        ),
        supportCases: state.supportCases.map((sc) =>
          sc.customerId === loser.id ? { ...sc, customerId: merged.id } : sc,
        ),
        webhookEvents: state.webhookEvents.map((e) =>
          e.customerId === loser.id ? { ...e, customerId: merged.id } : e,
        ),
      }
    })

    return resolvedId
  }

  public async appendInterest(
    customerId: string,
    kind: InterestKind | string,
    value: string,
  ): Promise<InterestRecord | undefined> {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    let result: InterestRecord | undefined

    this._store.update((state) => {
      if (!state.customers.some((c) => c.id === customerId)) {
        return state
      }
      const existing = state.interests.find(
        (entry) => entry.customerId === customerId && entry.kind === kind && entry.value === trimmed,
      )
      if (existing) {
        result = existing
        return state
      }
      const created: InterestRecord = {
        id: nextId('int'),
        customerId,
        kind,
        value: trimmed,
        capturedAt: nowIso(),
      }
      result = created
      return { ...state, interests: [...state.interests, created] }
    })

    return result
  }

  public async appendCurrentInterest(
    customerId: string,
    kind: InterestKind | string,
    value: string,
  ): Promise<CurrentInterestRecord | undefined> {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    let result: CurrentInterestRecord | undefined

    this._store.update((state) => {
      if (!state.customers.some((c) => c.id === customerId)) {
        return state
      }
      const existingIdx = state.currentInterests.findIndex(
        (entry) => entry.customerId === customerId && entry.kind === kind,
      )
      
      const now = nowIso()
      if (existingIdx !== -1) {
        const existing = state.currentInterests[existingIdx]
        const updated = { ...existing, value: trimmed, updatedAt: now }
        result = updated
        const newCurrentInterests = [...state.currentInterests]
        newCurrentInterests[existingIdx] = updated
        return { ...state, currentInterests: newCurrentInterests }
      }

      const created: CurrentInterestRecord = {
        id: nextId('cint'),
        customerId,
        kind,
        value: trimmed,
        createdAt: now,
        updatedAt: now,
      }
      result = created
      return { ...state, currentInterests: [...state.currentInterests, created] }
    })

    return result
  }

  public async createSupportCase(
    customerId: string,
    caseType: string,
    status: string = 'pending',
    id?: string,
  ): Promise<SupportCaseRecord> {
    const now = nowIso()
    const record: SupportCaseRecord = {
      id: id || nextId('case'),
      customerId,
      caseType,
      status,
      createdAt: now,
      updatedAt: now,
    }

    this._store.update((state) => ({
      ...state,
      supportCases: [...state.supportCases, record],
    }))

    return record
  }

  public async getSupportCase(supportCaseId: string): Promise<SupportCaseRecord | undefined> {
    const state = this._store.read()
    return state.supportCases.find((sc) => sc.id === supportCaseId)
  }

  public async updateSupportCaseStatus(
    supportCaseId: string,
    status: string,
  ): Promise<SupportCaseRecord | undefined> {
    let result: SupportCaseRecord | undefined

    this._store.update((state) => {
      const idx = state.supportCases.findIndex((sc) => sc.id === supportCaseId)
      if (idx === -1) return state
      
      const existing = state.supportCases[idx]
      const updated = { ...existing, status, updatedAt: nowIso() }
      result = updated
      
      const newSupportCases = [...state.supportCases]
      newSupportCases[idx] = updated
      
      return { ...state, supportCases: newSupportCases }
    })

    return result
  }

  public async appendConversationMessage(
    customerId: string,
    channelIdentityId: string,
    message: ConversationMessageRecord,
    channel: IncomingMessage['channel'],
    sourceId: string,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const timestamp = nowIso()
    let conversationRecord!: ConversationRecord

    this._store.update((state) => {
      const existing = state.conversations.find((conversation) => conversation.id === conversationId)

      if (existing) {
        conversationRecord = {
          ...existing,
          customerId,
          channelIdentityId,
          updatedAt: timestamp,
          messages: [...existing.messages, message],
        }
        return {
          ...state,
          conversations: state.conversations.map((conversation) => (
            conversation.id === conversationId ? conversationRecord : conversation
          )),
        }
      }

      conversationRecord = {
        id: conversationId,
        customerId,
        channelIdentityId,
        channel,
        sourceId,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [message],
      }

      return {
        ...state,
        conversations: [...state.conversations, conversationRecord],
      }
    })

    return conversationRecord
  }

  public async appendWebhookEvent(
    event: Omit<WebhookEventRecord, 'id' | 'receivedAt'>,
  ): Promise<WebhookEventRecord> {
    const record: WebhookEventRecord = {
      id: nextId('evt'),
      receivedAt: nowIso(),
      ...event,
    }

    this._store.update((state) => ({
      ...state,
      webhookEvents: [...state.webhookEvents.slice(-999), record],
    }))

    return record
  }

  public async getSummary(): Promise<RuntimeStoreSummary> {
    const state = this._store.read()
    return {
      customers: {
        total: state.customers.length,
        qualified: state.customers.filter((c) => c.qualificationStatus === 'qualified').length,
        pendingSync: state.customers.filter((c) => c.crmStatus !== 'synced').length,
      },
      conversations: state.conversations.length,
      webhookEvents: state.webhookEvents.length,
      identities: state.identities.length,
      channels: state.identities.reduce<Record<string, number>>((acc, identity) => {
        acc[identity.channel] = (acc[identity.channel] ?? 0) + 1
        return acc
      }, {}),
    }
  }

  public async listCustomers(): Promise<CustomerRecord[]> {
    return this._store.read().customers
  }

  public async listIdentities(): Promise<ChannelIdentityRecord[]> {
    return this._store
      .read()
      .identities.slice()
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }

  public async listConversations(): Promise<ConversationRecord[]> {
    return this._store.read().conversations
  }

  public async listInterestsByCustomer(customerId: string): Promise<InterestRecord[]> {
    return this._store
      .read()
      .interests.filter((entry) => entry.customerId === customerId)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  }

  public async getCustomer(customerId: string): Promise<CustomerRecord | undefined> {
    return this._store.read().customers.find((c) => c.id === customerId)
  }
}
