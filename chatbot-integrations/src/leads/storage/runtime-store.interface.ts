import type { IncomingMessage } from '../../core/types.js'
import type {
  ChannelIdentityRecord,
  ConversationMessageRecord,
  ConversationRecord,
  CustomerRecord,
  InterestKind,
  InterestRecord,
  WebhookEventRecord,
} from '../types/records.js'

export interface CustomerSnapshot {
  leadName?: string
  email?: string
  phone?: string
  location?: string
  preferredService?: string
  responseStyle?: CustomerRecord['responseStyle']
  qualificationStatus?: CustomerRecord['qualificationStatus']
  crmStatus?: CustomerRecord['crmStatus']
  crmRecordId?: string
  lastIntent?: string
  lastMessageAt?: string
}

export interface IdentitySnapshot {
  senderName?: string
  username?: string
  conversationId?: string
}

export interface ResolvedIdentity {
  customer: CustomerRecord
  identity: ChannelIdentityRecord
}

export interface MergeContact {
  phone?: string
  email?: string
}

export interface RuntimeStoreSummary {
  customers: {
    total: number
    qualified: number
    pendingSync: number
  }
  conversations: number
  webhookEvents: number
  channels: Record<string, number>
  identities: number
}

export interface RuntimeStore {
  shouldProcessDeduplication(key: string, ttlMs: number): Promise<boolean>

  /**
   * Look up the customer behind `(channel, sourceId)`. Creates the channel
   * identity (and a fresh customer) on first contact.
   */
  resolveIdentity(message: IncomingMessage, identityUpdate?: IdentitySnapshot): Promise<ResolvedIdentity>

  updateCustomer(customerId: string, snapshot: CustomerSnapshot): Promise<CustomerRecord | undefined>

  /**
   * Try to merge `customerId` into another customer that already has the
   * supplied phone/email. Returns the surviving customer's id (which may
   * be the same as the input). If no other customer matches, returns
   * `customerId` unchanged.
   */
  mergeCustomersByContact(customerId: string, contact: MergeContact): Promise<string>

  /**
   * Idempotent: skips inserts if the same (kind, value) already exists for
   * the customer.
   */
  appendInterest(customerId: string, kind: InterestKind | string, value: string): Promise<InterestRecord | undefined>

  appendConversationMessage(
    customerId: string,
    channelIdentityId: string,
    message: ConversationMessageRecord,
    channel: IncomingMessage['channel'],
    sourceId: string,
    conversationId: string,
  ): Promise<ConversationRecord>

  appendWebhookEvent(event: Omit<WebhookEventRecord, 'id' | 'receivedAt'>): Promise<WebhookEventRecord>

  getSummary(): Promise<RuntimeStoreSummary>
  listCustomers(): Promise<CustomerRecord[]>
  listConversations(): Promise<ConversationRecord[]>
  listIdentities(): Promise<ChannelIdentityRecord[]>
  listInterestsByCustomer(customerId: string): Promise<InterestRecord[]>
  getCustomer(customerId: string): Promise<CustomerRecord | undefined>
}
