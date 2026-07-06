import type { IncomingMessage, OutgoingMessage } from '../../core/types.js'

export type ChannelName = IncomingMessage['channel']

export type InterestKind =
  | 'product_type'
  | 'brand'
  | 'lens_type'
  | 'use_case'
  | 'preferred_service'
  | 'budget'
  | 'urgency'

export interface CustomerRecord {
  id: string
  leadName?: string
  email?: string
  phone?: string
  location?: string
  preferredService?: string
  responseStyle?: 'casual' | 'professional' | 'warm' | 'concierge'
  qualificationStatus: 'new' | 'qualified' | 'unqualified' | 'needs_review'
  crmStatus: 'pending' | 'synced' | 'failed'
  crmRecordId?: string
  lastIntent?: string
  lastMessageAt: string
  firstSeenAt: string
  updatedAt: string
}

export interface ChannelIdentityRecord {
  id: string
  customerId: string
  channel: ChannelName
  sourceId: string
  channelAccountId?: string
  accountLabel?: string
  senderName?: string
  username?: string
  conversationId: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface InterestRecord {
  id: string
  customerId: string
  kind: InterestKind | string
  value: string
  capturedAt: string
}

export interface CurrentInterestRecord {
  id: string
  customerId: string
  kind: InterestKind | string
  value: string
  createdAt: string
  updatedAt: string
}

export interface SupportCaseRecord {
  id: string
  customerId: string
  caseType: string
  status: string
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
    channel: ChannelName
    sourceId: string
    conversationId: string
    customerId: string
    channelIdentityId: string
    // Full rich outgoing payload (card/image/choice) so the admin transcript
    // can render exactly what the user saw, instead of a "[card]" placeholder.
    payload?: OutgoingMessage
  }
}

export interface ConversationRecord {
  id: string
  customerId: string
  channelIdentityId: string
  channel: ChannelName
  sourceId: string
  createdAt: string
  updatedAt: string
  messages: ConversationMessageRecord[]
}

export interface WebhookEventRecord {
  id: string
  channel: ChannelName
  direction: 'inbound' | 'outbound'
  path: string
  sourceId: string
  conversationId: string
  customerId?: string
  receivedAt: string
  payload: unknown
}

export interface DeduplicationRecord {
  key: string
  seenAt: number
}

export interface RuntimeDataShape {
  customers: CustomerRecord[]
  identities: ChannelIdentityRecord[]
  interests: InterestRecord[]
  currentInterests: CurrentInterestRecord[]
  supportCases: SupportCaseRecord[]
  conversations: ConversationRecord[]
  webhookEvents: WebhookEventRecord[]
  deduplication: DeduplicationRecord[]
}
