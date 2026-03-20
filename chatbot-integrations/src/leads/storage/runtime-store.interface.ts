import type { IncomingMessage } from '../../core/types.js'
import type {
  ConversationMessageRecord,
  ConversationRecord,
  LeadRecord,
  WebhookEventRecord,
} from '../types/records.js'

export interface LeadSnapshot {
  leadName?: string
  email?: string
  phone?: string
  preferredService?: string
  location?: string
  responseStyle?: LeadRecord['responseStyle']
  qualificationStatus?: LeadRecord['qualificationStatus']
  lastIntent?: string
}

export type LeadUpdatePayload = Partial<LeadRecord>

export interface RuntimeStoreSummary {
  leads: {
    total: number
    qualified: number
    pendingSync: number
  }
  conversations: number
  webhookEvents: number
  channels: Record<string, number>
}

export interface RuntimeStore {
  shouldProcessDeduplication(key: string, ttlMs: number): Promise<boolean>
  getOrCreateLead(message: IncomingMessage): Promise<LeadRecord>
  updateLead(leadId: string, snapshot: LeadUpdatePayload): Promise<LeadRecord | undefined>
  appendConversationMessage(
    leadId: string,
    message: ConversationMessageRecord,
    channel: IncomingMessage['channel'],
    sourceId: string,
    conversationId: string,
  ): Promise<ConversationRecord>
  appendWebhookEvent(event: Omit<WebhookEventRecord, 'id' | 'receivedAt'>): Promise<WebhookEventRecord>
  getSummary(): Promise<RuntimeStoreSummary>
  listLeads(): Promise<LeadRecord[]>
  listConversations(): Promise<ConversationRecord[]>
}
