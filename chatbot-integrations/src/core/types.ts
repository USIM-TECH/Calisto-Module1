/**
 * Shared types for the integration layer.
 *
 * These define the contract between channel integrations and whatever
 * NLP/bot logic you connect upstream. The integrations receive messages
 * and emit IncomingMessage events; your bot logic processes them and
 * calls the channel's sendMessage to reply.
 */

// ─── Incoming Messages ──────────────────────────────────

export interface IncomingMessage {
  /** Which channel this arrived on */
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'x' | 'telegram'
  /** Platform-specific sender ID */
  senderId: string
  /** Platform-specific conversation/thread ID */
  conversationId: string
  /** Sender display name (if available) */
  senderName?: string
  /** Message type */
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'location' | 'interactive' | 'reaction' | 'unknown'
  /** Text content (for text messages) */
  text?: string
  /** Media URL (for image/audio/video/file) */
  mediaUrl?: string
  /** Media MIME type */
  mimeType?: string
  /** Location data */
  location?: { latitude: number; longitude: number; address?: string; name?: string }
  /** Interactive reply data (button/list selection) */
  interactive?: { type: string; id: string; title: string }
  /** Platform-specific message ID */
  messageId: string
  /** Timestamp */
  timestamp: string
  /** Raw platform payload for advanced use */
  rawPayload: any
}

// ─── Outgoing Messages ──────────────────────────────────

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

// ─── Message Handler (NLP hook point) ───────────────────

/**
 * Implement this interface to connect your NLP / bot logic.
 *
 * The webhook layer calls `onMessage` when a message arrives.
 * Your handler processes it and calls the appropriate channel's
 * `sendMessage` to reply.
 *
 * This is the **future NLP connection point** — currently a no-op stub.
 */
export interface MessageHandler {
  onMessage(message: IncomingMessage): Promise<void>
}

// ─── CRM Types ──────────────────────────────────────────

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

// ─── Webhook Types ──────────────────────────────────────

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
