import crypto from 'crypto'
import path from 'path'
import type { IncomingMessage } from '../../core/types.js'
import { FileJsonStore } from './file-json-store.js'
import type {
  ConversationMessageRecord,
  ConversationRecord,
  LeadRecord,
  RuntimeDataShape,
  WebhookEventRecord,
} from '../types/records.js'

function nowIso(): string {
  return new Date().toISOString()
}

function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export interface LeadSnapshot {
  leadName?: string
  email?: string
  phone?: string
  preferredService?: string
  location?: string
  qualificationStatus: LeadRecord['qualificationStatus']
  lastIntent?: string
}

export class RuntimeStore {
  private readonly _store: FileJsonStore<RuntimeDataShape>

  constructor(baseDir: string) {
    this._store = new FileJsonStore<RuntimeDataShape>(path.join(baseDir, 'runtime-store.json'), {
      leads: [],
      conversations: [],
      webhookEvents: [],
      deduplication: [],
    })
  }

  public shouldProcessDeduplication(key: string, ttlMs: number): boolean {
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

  public getOrCreateLead(message: IncomingMessage): LeadRecord {
    const timestamp = nowIso()
    const sourceId = message.sourceId ?? message.senderId
    let leadRecord!: LeadRecord

    this._store.update((state) => {
      const existing = state.leads.find(
        (lead) => lead.channel === message.channel && lead.sourceId === sourceId
      )

      if (existing) {
        leadRecord = {
          ...existing,
          senderName: message.senderName ?? existing.senderName,
          conversationId: message.conversationId,
          lastMessageAt: message.timestamp,
          updatedAt: timestamp,
        }
        return {
          ...state,
          leads: state.leads.map((lead) => (lead.id === existing.id ? leadRecord : lead)),
        }
      }

      leadRecord = {
        id: nextId('lead'),
        channel: message.channel,
        sourceId,
        conversationId: message.conversationId,
        senderName: message.senderName,
        qualificationStatus: 'new',
        crmStatus: 'pending',
        lastMessageAt: message.timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      return {
        ...state,
        leads: [...state.leads, leadRecord],
      }
    })

    return leadRecord
  }

  public updateLead(leadId: string, snapshot: Partial<LeadSnapshot> & Partial<Pick<LeadRecord, 'crmStatus' | 'crmRecordId'>>): LeadRecord | undefined {
    const timestamp = nowIso()
    let nextLead: LeadRecord | undefined

    this._store.update((state) => {
      const current = state.leads.find((lead) => lead.id === leadId)
      if (!current) {
        return state
      }

      nextLead = {
        ...current,
        ...snapshot,
        updatedAt: timestamp,
      }

      return {
        ...state,
        leads: state.leads.map((lead) => (lead.id === leadId ? nextLead! : lead)),
      }
    })

    return nextLead
  }

  public appendConversationMessage(
    leadId: string,
    message: ConversationMessageRecord,
    channel: IncomingMessage['channel'],
    sourceId: string,
    conversationId: string,
  ): ConversationRecord {
    const timestamp = nowIso()
    let conversationRecord!: ConversationRecord

    this._store.update((state) => {
      const existing = state.conversations.find((conversation) => conversation.id === conversationId)

      if (existing) {
        conversationRecord = {
          ...existing,
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
        leadId,
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

  public appendWebhookEvent(event: Omit<WebhookEventRecord, 'id' | 'receivedAt'>): WebhookEventRecord {
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

  public getSummary() {
    const state = this._store.read()
    return {
      leads: {
        total: state.leads.length,
        qualified: state.leads.filter((lead) => lead.qualificationStatus === 'qualified').length,
        pendingSync: state.leads.filter((lead) => lead.crmStatus !== 'synced').length,
      },
      conversations: state.conversations.length,
      webhookEvents: state.webhookEvents.length,
      channels: state.leads.reduce<Record<string, number>>((acc, lead) => {
        acc[lead.channel] = (acc[lead.channel] ?? 0) + 1
        return acc
      }, {}),
    }
  }

  public listLeads(): LeadRecord[] {
    return this._store.read().leads
  }

  public listConversations(): ConversationRecord[] {
    return this._store.read().conversations
  }
}
