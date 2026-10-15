export type ManagedChannel = 'whatsapp' | 'instagram' | 'messenger' | 'telegram'

/** `payload` = Rasa buttons/forms flow, `chat` = free-text grounded assistant. */
export type ResponseMode = 'payload' | 'chat'

export interface WhatsAppCredentials {
  accessToken: string
  phoneNumberId: string
  clientSecret?: string
  clientId?: string
  wabaId?: string
}

export interface InstagramCredentials {
  accessToken: string
  instagramId: string
  clientId: string
  clientSecret?: string
}

export interface MessengerCredentials {
  pageAccessToken: string
  pageId: string
  clientId: string
  clientSecret?: string
  appToken?: string
}

export interface TelegramCredentials {
  botToken: string
  secretToken?: string
  apiBaseUrl?: string
}

export type ChannelCredentials =
  | WhatsAppCredentials
  | InstagramCredentials
  | MessengerCredentials
  | TelegramCredentials

export interface ChannelAccountRecord {
  id: string
  label: string
  channel: ManagedChannel
  nativeId: string
  enabled: boolean
  responseMode: ResponseMode
  verifyToken?: string
  metaAppId?: string
  apiVersion?: string
  webhookStatus: 'pending' | 'active' | 'error'
  webhookUrl?: string
  webhookError?: string
  tokenExpiresAt?: string
  createdAt: string
  updatedAt: string
}

export interface ChannelAccountInput {
  label: string
  channel: ManagedChannel
  nativeId?: string
  verifyToken?: string
  metaAppId?: string
  apiVersion?: string
  responseMode?: ResponseMode
  credentials: ChannelCredentials
}

export interface ChannelAccountUpdateInput {
  label?: string
  nativeId?: string
  verifyToken?: string
  metaAppId?: string
  apiVersion?: string
  enabled?: boolean
  responseMode?: ResponseMode
  credentials?: ChannelCredentials
}
