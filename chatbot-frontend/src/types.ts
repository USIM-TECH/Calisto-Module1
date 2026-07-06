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
  crmRecordId?: string
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
  channelAccountId?: string
  accountLabel?: string
  senderName?: string
  username?: string
  conversationId: string
  firstSeenAt: string
  lastSeenAt: string
}

export type ManagedChannel = 'whatsapp' | 'instagram' | 'messenger' | 'telegram'

export interface ChannelAccountRecord {
  id: string
  label: string
  channel: ManagedChannel
  nativeId: string
  enabled: boolean
  verifyToken?: string
  metaAppId?: string
  apiVersion?: string
  webhookStatus: 'pending' | 'active' | 'error'
  webhookUrl?: string
  webhookError?: string
  tokenExpiresAt?: string
  createdAt: string
  updatedAt: string
  credentialsPreview: Record<string, string | undefined>
}

export interface ChannelAccountInput {
  label: string
  channel: ManagedChannel
  nativeId?: string
  verifyToken?: string
  metaAppId?: string
  apiVersion?: string
  credentials: Record<string, string | undefined>
}

export interface ChannelAccountListResult {
  items: ChannelAccountRecord[]
}

export interface ConversationMessageRecord {
  direction: 'inbound' | 'outbound'
  messageId: string
  text?: string
  messageType: string
  timestamp: string
  metadata: {
    channel: ChannelIdentityRecord['channel']
    sourceId: string
    conversationId: string
    customerId: string
    channelIdentityId: string
    payload?: OutgoingMessage
  }
}

export interface ConversationRecord {
  id: string
  customerId: string
  channelIdentityId: string
  channel: ChannelIdentityRecord['channel']
  sourceId: string
  createdAt: string
  updatedAt: string
  messages: ConversationMessageRecord[]
}

export interface InterestRecord {
  id: string
  customerId: string
  kind: string
  value: string
  capturedAt: string
}

export interface LeadCRMInfo {
  status: 'pending' | 'synced' | 'failed'
  recordId?: string
}

export interface LeadDetailResponse {
  customer: CustomerRecord
  identities: ChannelIdentityRecord[]
  interests: InterestRecord[]
  transcript: ConversationMessageRecord[]
  conversations: ConversationRecord[]
  crm: LeadCRMInfo
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
  description?: string | null
  frameMaterial?: string | null
  frameShape?: string | null
  frameColor?: string | null
  gender?: string | null
  uvProtection?: string | null
  polarized?: string | null
  lensColor?: string | null
  frameStyle?: string | null
  lensType?: string | null
  lensFeature?: string | null
  lensDuration?: string | null
  multifocal?: string | null
  storeLocation?: string | null
  city?: string | null
  stockStatus: string
  rating?: number | null
  bestseller?: boolean
  newArrival?: boolean
  imageUrl?: string | null
  fallbackImageUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ProductListResult {
  items: ProductRecord[]
  total: number
  page: number
  limit: number
}

export interface PresetRecord {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  sortOrder: number
  productCount: number
  createdAt: string
  updatedAt: string
}

export interface PresetListResult {
  items: PresetRecord[]
  activePresetId: string | null
}

export type ProductImportMode = 'skip' | 'update'

export interface ProductImportInvalidRow {
  line: number
  productId?: string
  reason: string
  missingFields?: string[]
}

export interface ProductImportResult {
  ok: boolean
  total: number
  inserted: number
  updated: number
  skipped: number
  invalid: number
  invalidRows: ProductImportInvalidRow[]
  warnings: string[]
}

export interface KnowledgeSummaryResponse {
  sources: Array<{ source: string; count: number }>
}

export interface KnowledgeChunkRecord {
  id: string
  chunkHash: string
  source: string
  text: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentSummary {
  source: string
  title?: string | null
  chunkCount: number
  updatedAt: string
}

export interface KnowledgeDocumentsResponse {
  documents: KnowledgeDocumentSummary[]
}

export interface KnowledgeDocumentDetail {
  source: string
  chunkCount: number
  updatedAt: string | null
  items: KnowledgeChunkRecord[]
  total: number
  page: number
  limit: number
}
