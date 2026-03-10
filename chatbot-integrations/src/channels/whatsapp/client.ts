import axios from 'axios'
import { WhatsAppAPI } from 'whatsapp-api-js'
import { Text, Image, Audio, Video, Document, Location, Interactive } from 'whatsapp-api-js/messages'
import { convertMarkdownToWhatsApp, splitTextMessageIfNeeded } from './formatting.js'
import { WhatsAppPayloadSchema, type WhatsAppPayload, type WhatsAppMessage } from './types.js'
import { validateMetaSignature, sleep, type Logger } from '../../utils/index.js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../types.js'

const PART_DELAY_MS = 1000

export interface WhatsAppConfig {
  accessToken: string
  phoneNumberId: string
  verifyToken: string
  clientSecret?: string
  apiVersion?: string
}

/**
 * WhatsApp Channel Integration.
 * Extracted from Botpress WhatsApp integration with Botpress SDK dependencies removed.
 * Uses whatsapp-api-js and direct Meta Cloud API calls.
 */
export class WhatsAppChannel {
  private _client: WhatsAppAPI
  private _config: WhatsAppConfig
  private _logger: Logger
  private _onMessage?: (message: IncomingMessage) => Promise<void>

  constructor(config: WhatsAppConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    this._client = new WhatsAppAPI({
      token: config.accessToken,
      secure: false,
      v: config.apiVersion ?? 'v22.0',
    })
  }

  /** Register a callback for incoming messages (NLP connection point) */
  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  /** Send an outgoing message to a WhatsApp user */
  public async sendMessage(recipientPhone: string, message: OutgoingMessage): Promise<string | undefined> {
    switch (message.type) {
      case 'text': {
        const text = convertMarkdownToWhatsApp(message.text)
        const chunks = splitTextMessageIfNeeded(text)
        let lastId: string | undefined
        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) await sleep(PART_DELAY_MS)
          const response = await this._client.sendMessage(
            this._config.phoneNumberId,
            recipientPhone,
            new Text(chunks[i]!)
          )
          lastId = (response as any)?.messages?.[0]?.id
        }
        return lastId
      }
      case 'image': {
        const response = await this._client.sendMessage(
          this._config.phoneNumberId,
          recipientPhone,
          new Image(message.imageUrl, false)
        )
        return (response as any)?.messages?.[0]?.id
      }
      case 'audio': {
        const response = await this._client.sendMessage(
          this._config.phoneNumberId,
          recipientPhone,
          new Audio(message.audioUrl, false)
        )
        return (response as any)?.messages?.[0]?.id
      }
      case 'video': {
        const response = await this._client.sendMessage(
          this._config.phoneNumberId,
          recipientPhone,
          new Video(message.videoUrl, false)
        )
        return (response as any)?.messages?.[0]?.id
      }
      case 'file': {
        const filename = message.filename ?? message.title ?? 'file'
        const response = await this._client.sendMessage(
          this._config.phoneNumberId,
          recipientPhone,
          new Document(message.fileUrl, false, message.title, filename)
        )
        return (response as any)?.messages?.[0]?.id
      }
      case 'location': {
        const response = await this._client.sendMessage(
          this._config.phoneNumberId,
          recipientPhone,
          new Location(message.longitude, message.latitude, message.name, message.address)
        )
        return (response as any)?.messages?.[0]?.id
      }
      case 'choice': {
        if (message.options.length <= 3) {
          // Use buttons
          const buttons = message.options.map((opt) => ({
            type: 'reply' as const,
            reply: { id: opt.value, title: opt.label.substring(0, 20) },
          }))
          const interactive = new Interactive(
            {
              type: 'button',
              body: { text: message.text },
              action: { buttons },
            } as any
          )
          const response = await this._client.sendMessage(
            this._config.phoneNumberId,
            recipientPhone,
            interactive
          )
          return (response as any)?.messages?.[0]?.id
        } else {
          // Use list
          const rows = message.options.map((opt) => ({
            id: opt.value,
            title: opt.label.substring(0, 24),
          }))
          const interactive = new Interactive(
            {
              type: 'list',
              body: { text: message.text },
              action: {
                button: 'Choose',
                sections: [{ title: 'Options', rows }],
              },
            } as any
          )
          const response = await this._client.sendMessage(
            this._config.phoneNumberId,
            recipientPhone,
            interactive
          )
          return (response as any)?.messages?.[0]?.id
        }
      }
      default:
        this._logger.warn(`Unsupported outgoing message type: ${(message as any).type}`)
        return undefined
    }
  }

  /** Retrieve media URL from WhatsApp media ID */
  public async getMediaUrl(mediaId: string): Promise<string> {
    const apiVersion = this._config.apiVersion ?? 'v22.0'
    const { data } = await axios.get(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })
    return data.url
  }

  /**
   * Handle incoming webhook requests from Meta.
   * This is the main entry point called by the webhook router.
   */
  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    try {
      // Handle webhook verification (subscribe challenge)
      const queryParams = new URLSearchParams(req.query)
      if (queryParams.has('hub.mode')) {
        return this._handleVerification(queryParams)
      }

      // Validate signature
      if (this._config.clientSecret) {
        const { valid, error } = validateMetaSignature(
          req.body,
          req.headers['x-hub-signature-256'],
          this._config.clientSecret
        )
        if (!valid) {
          this._logger.error(`WhatsApp webhook signature validation failed: ${error}`)
          return { status: 401, body: error }
        }
      }

      if (!req.body) {
        this._logger.debug('WhatsApp webhook received empty body')
        return { status: 200 }
      }

      let payload: WhatsAppPayload
      try {
        payload = WhatsAppPayloadSchema.parse(JSON.parse(req.body))
      } catch (e: any) {
        this._logger.error('Failed to parse WhatsApp webhook payload:', e.message)
        return { status: 400, body: 'Invalid payload' }
      }

      const changes = payload.entry[0]?.changes[0]
      if (!changes?.value) {
        return { status: 200 }
      }

      if (changes.field === 'messages') {
        // Process status updates
        for (const status of changes.value.statuses ?? []) {
          this._logger.debug(`WhatsApp message ${status.id} status: ${status.status}`)
        }

        // Process incoming messages
        for (const message of changes.value.messages ?? []) {
          await this._processIncomingMessage(message, changes.value)
        }
      }

      return { status: 200 }
    } catch (error: any) {
      this._logger.error(`WhatsApp webhook error: ${error.message}`)
      return { status: 500, body: 'Internal error' }
    }
  }

  private _handleVerification(params: URLSearchParams): WebhookResponse {
    const mode = params.get('hub.mode')
    const token = params.get('hub.verify_token')
    const challenge = params.get('hub.challenge')

    if (mode === 'subscribe' && token === this._config.verifyToken) {
      this._logger.info('WhatsApp webhook verified successfully')
      return { status: 200, body: challenge ?? '' }
    }

    this._logger.warn('WhatsApp webhook verification failed')
    return { status: 403, body: 'Forbidden' }
  }

  private async _processIncomingMessage(message: WhatsAppMessage, value: any): Promise<void> {
    const contact = value.contacts?.[0]
    const senderName = contact?.profile?.name

    const incoming: IncomingMessage = {
      channel: 'whatsapp',
      senderId: message.from,
      conversationId: message.from, // WhatsApp uses phone number as conversation ID
      senderName,
      messageId: message.id,
      timestamp: message.timestamp,
      type: 'unknown',
      rawPayload: message,
    }

    switch (message.type) {
      case 'text':
        incoming.type = 'text'
        incoming.text = (message as any).text.body
        break
      case 'image':
        incoming.type = 'image'
        incoming.mimeType = (message as any).image.mime_type
        try { incoming.mediaUrl = await this.getMediaUrl((message as any).image.id) } catch { /* handled below */ }
        break
      case 'audio':
        incoming.type = 'audio'
        incoming.mimeType = (message as any).audio.mime_type
        try { incoming.mediaUrl = await this.getMediaUrl((message as any).audio.id) } catch { /* handled below */ }
        break
      case 'video':
        incoming.type = 'video'
        incoming.mimeType = (message as any).video.mime_type
        try { incoming.mediaUrl = await this.getMediaUrl((message as any).video.id) } catch { /* handled below */ }
        break
      case 'document':
        incoming.type = 'file'
        incoming.mimeType = (message as any).document.mime_type
        try { incoming.mediaUrl = await this.getMediaUrl((message as any).document.id) } catch { /* handled below */ }
        break
      case 'location':
        incoming.type = 'location'
        incoming.location = {
          latitude: (message as any).location.latitude,
          longitude: (message as any).location.longitude,
          address: (message as any).location.address,
          name: (message as any).location.name,
        }
        break
      case 'interactive':
        incoming.type = 'interactive'
        const interactive = (message as any).interactive
        if (interactive.type === 'button_reply') {
          incoming.interactive = {
            type: 'button',
            id: interactive.button_reply.id,
            title: interactive.button_reply.title,
          }
          incoming.text = interactive.button_reply.title
        } else if (interactive.type === 'list_reply') {
          incoming.interactive = {
            type: 'list',
            id: interactive.list_reply.id,
            title: interactive.list_reply.title,
          }
          incoming.text = interactive.list_reply.title
        }
        break
      case 'button':
        incoming.type = 'interactive'
        incoming.text = (message as any).button.text
        incoming.interactive = {
          type: 'button',
          id: (message as any).button.payload,
          title: (message as any).button.text,
        }
        break
      case 'reaction':
        incoming.type = 'reaction'
        break
      default:
        incoming.type = 'unknown'
    }

    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`WhatsApp message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }
}
