export interface WebchatRequest {
  senderId?: string
  message: string
}

export interface OutgoingTextMessage {
  type: 'text'
  text: string
}

export interface OutgoingImageMessage {
  type: 'image'
  imageUrl: string
  caption?: string
}

export interface OutgoingCardMessage {
  type: 'card'
  title: string
  subtitle?: string
  imageUrl?: string
  actions?: Array<{ type: 'url' | 'postback'; title: string; value: string }>
}

export interface OutgoingChoiceMessage {
  type: 'choice'
  text: string
  options: Array<{ label: string; value: string }>
}

export type OutgoingMessage =
  | OutgoingTextMessage
  | OutgoingImageMessage
  | OutgoingCardMessage
  | OutgoingChoiceMessage

export interface WebchatResponse {
  senderId: string
  customerId: string
  conversationId: string
  messages: OutgoingMessage[]
}

export interface LeadsSummary {
  customers: { total: number; qualified: number; pendingSync: number }
  conversations: number
  webhookEvents: number
  identities: number
  channels: Record<string, number>
}

export interface CustomerRecord {
  id: string
  leadName?: string
  email?: string
  phone?: string
  location?: string
  qualificationStatus: string
  crmStatus: string
  lastIntent?: string
  lastMessageAt: string
  firstSeenAt: string
  preferredService?: string
  updatedAt: string
}

export interface ChannelIdentityRecord {
  id: string
  customerId: string
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'telegram' | 'x' | 'website'
  sourceId: string
  senderName?: string
  username?: string
  conversationId: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface LeadsResponse {
  customers: CustomerRecord[]
  identities: ChannelIdentityRecord[]
  summary: LeadsSummary
  services: { hubspot: boolean }
}

export interface ProductRecord {
  productId: string
  productName: string
  brand: string
  productType: string
  category: string
  priceMyr: number
  stockStatus: string
  rating?: number | null
  imageUrl?: string | null
}

export interface ProductListResult {
  items: ProductRecord[]
  total: number
  page: number
  limit: number
}

export interface KnowledgeSummaryResponse {
  sources: Array<{ source: string; count: number }>
}
