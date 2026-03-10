import axios from 'axios'
import { z } from 'zod'
import {
  messengerPayloadSchema,
  type MessengerPayload,
  type MessengerMessagingItemMessage,
  type MessengerMessagingItemPostback,
  type CardPayload,
  type ChoicePayload,
  type MessengerOutMessageAttachment,
} from './types.js'
import { validateMetaSignature, type Logger } from '../../utils/index.js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../types.js'

export interface MessengerConfig {
  pageAccessToken: string
  pageId: string
  verifyToken: string
  clientId: string
  clientSecret?: string
  appToken?: string
  apiVersion?: string
}

/**
 * Messenger Channel Integration.
 * Extracted from Botpress Messenger integration with Botpress SDK dependencies removed.
 * Uses direct Meta Graph API calls via axios.
 */
export class MessengerChannel {
  private _config: MessengerConfig
  private _logger: Logger
  private _baseUrl: string
  private _onMessage?: (message: IncomingMessage) => Promise<void>

  constructor(config: MessengerConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    const version = config.apiVersion ?? 'v23.0'
    this._baseUrl = `https://graph.facebook.com/${version}`
  }

  /** Register a callback for incoming messages */
  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  // ── Outgoing Messages ──────────────────────────────────────────────

  /** Send a text message via Messenger Send API */
  public async sendText(recipientId: string, text: string): Promise<string> {
    return this._sendViaApi(recipientId, { text })
  }

  /** Send an image message */
  public async sendImage(recipientId: string, imageUrl: string): Promise<string> {
    return this._sendViaApi(recipientId, {
      attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } },
    })
  }

  /** Send an audio message */
  public async sendAudio(recipientId: string, audioUrl: string): Promise<string> {
    return this._sendViaApi(recipientId, {
      attachment: { type: 'audio', payload: { url: audioUrl, is_reusable: true } },
    })
  }

  /** Send a video message */
  public async sendVideo(recipientId: string, videoUrl: string): Promise<string> {
    return this._sendViaApi(recipientId, {
      attachment: { type: 'video', payload: { url: videoUrl, is_reusable: true } },
    })
  }

  /** Send a file message */
  public async sendFile(recipientId: string, fileUrl: string): Promise<string> {
    return this._sendViaApi(recipientId, {
      attachment: { type: 'file', payload: { url: fileUrl, is_reusable: true } },
    })
  }

  /** Send a location as Google Maps link */
  public async sendLocation(recipientId: string, latitude: number, longitude: number): Promise<string> {
    const link = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    return this.sendText(recipientId, link)
  }

  /** Send an outgoing message (dispatches by type) */
  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    switch (message.type) {
      case 'text':
        return this.sendText(recipientId, message.text)
      case 'image':
        return this.sendImage(recipientId, message.imageUrl)
      case 'audio':
        return this.sendAudio(recipientId, message.audioUrl)
      case 'video':
        return this.sendVideo(recipientId, message.videoUrl)
      case 'file':
        return this.sendFile(recipientId, message.fileUrl)
      case 'location':
        return this.sendLocation(recipientId, message.latitude, message.longitude)
      case 'choice': {
        const choiceMsg = this._getChoiceMessage({ text: message.text, options: message.options })
        return this._sendViaApi(recipientId, choiceMsg)
      }
      default:
        this._logger.warn(`Unsupported outgoing message type for Messenger: ${(message as any).type}`)
        return undefined
    }
  }

  // ── OAuth Helpers ──────────────────────────────────────────────────

  /** Exchange authorization code for access token */
  public async exchangeAuthorizationCodeForAccessToken(code: string, redirectUri: string): Promise<string> {
    const query = new URLSearchParams({
      client_id: this._config.clientId,
      client_secret: this._config.clientSecret ?? '',
      redirect_uri: redirectUri,
      code,
    })

    const response = await axios.get(`${this._baseUrl}/oauth/access_token?${query.toString()}`)
    const { access_token } = z.object({ access_token: z.string() }).parse(response.data)
    return access_token
  }

  /** Subscribe page to webhooks */
  public async subscribeToWebhooks(): Promise<void> {
    const response = await axios.post(
      `${this._baseUrl}/${this._config.pageId}/subscribed_apps`,
      { subscribed_fields: ['messages', 'messaging_postbacks', 'feed'] },
      { headers: { Authorization: `Bearer ${this._config.pageAccessToken}` } }
    )
    if (!response.data.success) {
      throw new Error('Failed to subscribe to webhooks')
    }
  }

  /** Unsubscribe page from webhooks */
  public async unsubscribeFromWebhooks(): Promise<void> {
    const response = await axios.delete(
      `${this._baseUrl}/${this._config.pageId}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${this._config.pageAccessToken}` } }
    )
    if (!response.data?.success) {
      throw new Error('Failed to unsubscribe from webhooks')
    }
  }

  // ── Webhook Handler ────────────────────────────────────────────────

  /** Handle incoming webhook requests from Meta for Messenger */
  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    try {
      // Handle webhook verification
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
          this._logger.error(`Messenger webhook signature validation failed: ${error}`)
          return { status: 401, body: error }
        }
      }

      if (!req.body) {
        this._logger.warn('Messenger handler received empty body')
        return { status: 200 }
      }

      let payload: MessengerPayload
      try {
        const parsed = JSON.parse(req.body)
        const result = messengerPayloadSchema.safeParse(parsed)
        if (!result.success) {
          this._logger.warn('Unsupported Messenger event payload: ' + result.error.message)
          return { status: 200 }
        }
        payload = result.data
      } catch {
        return { status: 400, body: 'Invalid JSON payload' }
      }

      for (const entry of payload.entry) {
        if ('messaging' in entry) {
          for (const item of entry.messaging) {
            await this._processMessagingItem(item)
          }
        }
        // Feed/comment entries can be processed here if needed
      }

      return { status: 200 }
    } catch (error: any) {
      this._logger.error(`Messenger webhook error: ${error.message}`)
      return { status: 500, body: 'Internal error' }
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private async _sendViaApi(recipientId: string, message: any): Promise<string> {
    const url = `${this._baseUrl}/me/messages`
    const response = await axios.post(
      url,
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message,
      },
      {
        headers: { Authorization: `Bearer ${this._config.pageAccessToken}` },
      }
    )
    return response.data?.message_id ?? ''
  }

  private _handleVerification(params: URLSearchParams): WebhookResponse {
    const mode = params.get('hub.mode')
    const token = params.get('hub.verify_token')
    const challenge = params.get('hub.challenge')

    if (mode === 'subscribe' && token === this._config.verifyToken) {
      this._logger.info('Messenger webhook verified successfully')
      return { status: 200, body: challenge ?? '' }
    }

    this._logger.warn('Messenger webhook verification failed')
    return { status: 403, body: 'Forbidden' }
  }

  private async _processMessagingItem(item: any): Promise<void> {
    const incoming: IncomingMessage = {
      channel: 'messenger',
      senderId: item.sender.id,
      conversationId: item.sender.id,
      messageId: '',
      timestamp: String(item.timestamp),
      type: 'unknown',
      rawPayload: item,
    }

    if ('message' in item) {
      const msg = item as MessengerMessagingItemMessage
      incoming.messageId = msg.message.mid

      if (msg.message.quick_reply) {
        incoming.type = 'interactive'
        incoming.interactive = {
          type: 'button',
          id: msg.message.quick_reply.payload,
          title: msg.message.text ?? '',
        }
        incoming.text = msg.message.text
      } else if (msg.message.text) {
        incoming.type = 'text'
        incoming.text = msg.message.text
      } else if (msg.message.attachments?.length) {
        const attachment = msg.message.attachments[0]!
        const typeMap: Record<string, IncomingMessage['type']> = {
          image: 'image',
          audio: 'audio',
          video: 'video',
          file: 'file',
        }
        incoming.type = typeMap[attachment.type] ?? 'unknown'
        incoming.mediaUrl = attachment.payload.url
      }
    } else if ('postback' in item) {
      const pb = item as MessengerMessagingItemPostback
      incoming.messageId = pb.postback.mid
      incoming.type = 'interactive'
      incoming.text = pb.postback.title
      incoming.interactive = {
        type: 'button',
        id: pb.postback.payload,
        title: pb.postback.title,
      }
    }

    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`Messenger message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }

  private _formatCardElement(payload: CardPayload): any {
    const buttons: MessengerOutMessageAttachment[] = payload.actions.map((action) => {
      switch (action.action) {
        case 'postback':
        case 'say':
          return { type: 'postback' as const, title: action.label, payload: action.value }
        case 'url':
          return { type: 'web_url' as const, title: action.label, url: action.value }
        default:
          return { type: 'postback' as const, title: action.label, payload: action.value }
      }
    })
    return {
      title: payload.title,
      image_url: payload.imageUrl,
      subtitle: payload.subtitle,
      buttons,
    }
  }

  private _getChoiceMessage(payload: ChoicePayload): any {
    if (!payload.options.length) {
      return { text: payload.text }
    }
    if (payload.options.length > 13) {
      return { text: `${payload.text}\n\n${payload.options.map((o, idx) => `${idx + 1}. ${o.label}`).join('\n')}` }
    }
    return {
      text: payload.text,
      quick_replies: payload.options.map((option) => ({
        content_type: 'text',
        title: option.label,
        payload: option.value,
      })),
    }
  }
}
