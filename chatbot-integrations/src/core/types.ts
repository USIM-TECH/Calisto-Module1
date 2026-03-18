export interface IncomingMessage {

  channel: 'whatsapp' | 'instagram' | 'messenger' | 'x' | 'telegram' | 'website'

  senderId: string

  sourceId?: string

  conversationId: string

  leadId?: string

  senderName?: string

  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'location' | 'interactive' | 'reaction' | 'unknown'

  text?: string

  mediaUrl?: string

  mimeType?: string

  location?: { latitude: number; longitude: number; address?: string; name?: string }

  interactive?: { type: string; id: string; title: string }

  messageId: string

  timestamp: string

  rawPayload: any
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

export interface OutgoingAudioMessage {
  type: 'audio'
  audioUrl: string
}

export interface OutgoingVideoMessage {
  type: 'video'
  videoUrl: string
  caption?: string
}

export interface OutgoingFileMessage {
  type: 'file'
  fileUrl: string
  title?: string
  filename?: string
}

export interface OutgoingLocationMessage {
  type: 'location'
  latitude: number
  longitude: number
  name?: string
  address?: string
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
  | OutgoingAudioMessage
  | OutgoingVideoMessage
  | OutgoingFileMessage
  | OutgoingLocationMessage
  | OutgoingCardMessage
  | OutgoingChoiceMessage



export interface MessageHandler {
  onMessage(message: IncomingMessage): Promise<void>
}

export interface CrmContact {
  id: string
  email?: string
  phone?: string
  properties: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface CrmDeal {
  id: string
  name: string
  properties: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface CrmLead {
  id: string
  name: string
  properties: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface WebhookRequest {
  method: string
  path: string
  headers: Record<string, string | undefined>
  query: string
  body: string
}

export interface WebhookResponse {
  status: number
  body?: string
  headers?: Record<string, string>
}
