import type { IncomingMessage } from '../core/types.js'

export interface LeadRecord {
  id: string
  channel: IncomingMessage['channel']
  sourceId: string
  conversationId: string
  senderName?: string
  leadName?: string
  email?: string
  phone?: string
  preferredService?: string
  location?: string
  qualificationStatus: 'new' | 'qualified' | 'unqualified' | 'needs_review'
  crmStatus: 'pending' | 'synced' | 'failed'
  crmRecordId?: string
  lastIntent?: string
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMessageRecord {
  direction: 'inbound' | 'outbound'
  messageId: string
  text?: string
  messageType: string
  timestamp: string
  metadata: {
    channel: IncomingMessage['channel']
    sourceId: string
    conversationId: string
    leadId: string
  }
}

export interface ConversationRecord {
  id: string
  leadId: string
  channel: IncomingMessage['channel']
  sourceId: string
  createdAt: string
  updatedAt: string
  messages: ConversationMessageRecord[]
}

export interface WebhookEventRecord {
  id: string
  channel: IncomingMessage['channel'] | 'website'
  direction: 'inbound' | 'outbound'
  path: string
  sourceId: string
  conversationId: string
  leadId?: string
  receivedAt: string
  payload: unknown
}

export interface DeduplicationRecord {
  key: string
  seenAt: number
}

export interface RuntimeDataShape {
  leads: LeadRecord[]
  conversations: ConversationRecord[]
  webhookEvents: WebhookEventRecord[]
  deduplication: DeduplicationRecord[]
}
