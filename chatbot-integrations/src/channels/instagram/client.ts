import axios from 'axios'
import { z } from 'zod'
import {
  instagramPayloadSchema,
  type InstagramRecipientId,
  type InstagramPayload,
  type InstagramMessagingItemMessage,
  type InstagramMessagingItemPostback,
  type CardPayload,
  type CarouselPayload,
  type ChoicePayload,
  type GenericTemplateElement,
  type GenericTemplateMessage,
  type TextMessageWithQuickReplies,
  type InstagramAction,
} from './types.js'
import { validateMetaSignature, type Logger } from '../../utils/index.js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../types.js'

export interface InstagramConfig {
  accessToken: string
  instagramId: string
  verifyToken: string
  clientId: string
  clientSecret?: string
  apiVersion?: string
}

/**
 * Instagram Channel Integration.
 * Extracted from Botpress Instagram integration with Botpress SDK dependencies removed.
 * Uses direct Meta Graph API calls via axios.
 */
export class InstagramChannel {
  private _config: InstagramConfig
  private _logger: Logger
  private _baseUrl: string
  private _onMessage?: (message: IncomingMessage) => Promise<void>

  constructor(config: InstagramConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    const version = config.apiVersion ?? 'v21.0'
    this._baseUrl = `https://graph.instagram.com/${version}`
  }

  /** Register a callback for incoming messages */
  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  // ── Outgoing Messages ──────────────────────────────────────────────

  /** Send a text message */
  public async sendTextMessage(recipientId: string, text: string): Promise<string> {
    const response = await this._sendMessage({ id: recipientId }, { text })
    return response.message_id
  }

  /** Send an image message */
  public async sendImageMessage(recipientId: string, imageUrl: string): Promise<string> {
    const response = await this._sendMessage({ id: recipientId }, {
      attachment: { type: 'image', payload: { url: imageUrl } },
    })
    return response.message_id
  }

  /** Send an audio message */
  public async sendAudioMessage(recipientId: string, audioUrl: string): Promise<string> {
    const response = await this._sendMessage({ id: recipientId }, {
      attachment: { type: 'audio', payload: { url: audioUrl } },
    })
    return response.message_id
  }

  /** Send a video message */
  public async sendVideoMessage(recipientId: string, videoUrl: string): Promise<string> {
    const response = await this._sendMessage({ id: recipientId }, {
      attachment: { type: 'video', payload: { url: videoUrl } },
    })
    return response.message_id
  }

  /** Send a file message */
  public async sendFileMessage(recipientId: string, fileUrl: string): Promise<string> {
    const response = await this._sendMessage({ id: recipientId }, {
      attachment: { type: 'file', payload: { url: fileUrl } },
    })
    return response.message_id
  }

  /** Send a location as Google Maps link */
  public async sendLocationMessage(recipientId: string, latitude: number, longitude: number): Promise<string> {
    const googleMapLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    return this.sendTextMessage(recipientId, googleMapLink)
  }

  /** Reply to a comment */
  public async replyToComment(commentId: string, text: string): Promise<string> {
    const fields = new URLSearchParams({ message: text })
    const url = `${this._baseUrl}/${commentId}/replies?${fields.toString()}`
    const response = await axios.post<{ id: string }>(url, {}, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })
    const { id } = z.object({ id: z.string() }).parse(response.data)
    return id
  }

  /** Send an outgoing message (dispatches by type) */
  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    switch (message.type) {
      case 'text':
        return this.sendTextMessage(recipientId, message.text)
      case 'image':
        return this.sendImageMessage(recipientId, message.imageUrl)
      case 'audio':
        return this.sendAudioMessage(recipientId, message.audioUrl)
      case 'video':
        return this.sendVideoMessage(recipientId, message.videoUrl)
      case 'file':
        return this.sendFileMessage(recipientId, message.fileUrl)
      case 'location':
        return this.sendLocationMessage(recipientId, message.latitude, message.longitude)
      case 'choice': {
        const choiceMsg = this._getChoiceMessage({ text: message.text, options: message.options })
        const response = await this._sendMessage({ id: recipientId }, choiceMsg)
        return response.message_id
      }
      default:
        this._logger.warn(`Unsupported outgoing message type for Instagram: ${(message as any).type}`)
        return undefined
    }
  }

  /** Get user profile information */
  public async getUserProfile(instagramUserId: string): Promise<{ id: string; name: string; username: string }> {
    const query = new URLSearchParams({
      access_token: this._config.accessToken,
      fields: 'id,name,username',
    })
    const url = `${this._baseUrl}/${instagramUserId}?${query.toString()}`
    const response = await axios.get(url)
    return response.data
  }

  // ── OAuth Helpers ──────────────────────────────────────────────────

  /** Exchange an authorization code for an access token */
  public async getAccessTokenFromCode(code: string, redirectUri: string): Promise<{ accessToken: string; expirationTime: number }> {
    const formData = {
      client_id: this._config.clientId,
      client_secret: this._config.clientSecret ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }
    const queryString = new URLSearchParams(formData)
    let res = await axios.post('https://api.instagram.com/oauth/access_token', queryString.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const shortLivedTokenData = z.object({ access_token: z.string() }).parse(res.data)

    const query = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: this._config.clientSecret ?? '',
      access_token: shortLivedTokenData.access_token,
    })
    res = await axios.get(`https://graph.instagram.com/access_token?${query.toString()}`)
    const { access_token, expires_in } = z.object({ access_token: z.string(), expires_in: z.number() }).parse(res.data)

    return { accessToken: access_token, expirationTime: Date.now() + expires_in * 1000 }
  }

  /** Refresh the access token */
  public async refreshAccessToken(): Promise<{ accessToken: string; expirationTime: number }> {
    const query = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: this._config.accessToken,
    })
    const response = await axios.get(`https://graph.instagram.com/refresh_access_token?${query.toString()}`)
    const { access_token, expires_in } = z.object({ access_token: z.string(), expires_in: z.number() }).parse(response.data)
    return { accessToken: access_token, expirationTime: Date.now() + expires_in * 1000 }
  }

  // ── Webhook Handler ────────────────────────────────────────────────

  /** Handle incoming webhook requests from Meta for Instagram */
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
          this._logger.error(`Instagram webhook signature validation failed: ${error}`)
          return { status: 401, body: error }
        }
      }

      if (!req.body) {
        return { status: 200 }
      }

      let payload: InstagramPayload
      try {
        const parsed = JSON.parse(req.body)
        const result = instagramPayloadSchema.safeParse(parsed)
        if (!result.success) {
          this._logger.warn('Unsupported Instagram event payload: ' + result.error.message)
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
        // Comment entries can be processed here if needed
      }

      return { status: 200 }
    } catch (error: any) {
      this._logger.error(`Instagram webhook error: ${error.message}`)
      return { status: 500, body: 'Internal error' }
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private async _sendMessage(recipient: InstagramRecipientId, message: any): Promise<{ recipient_id: string; message_id: string }> {
    const url = `${this._baseUrl}/${this._config.instagramId}/messages`
    const response = await axios.post(url, { recipient, message }, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })
    return response.data
  }

  private _handleVerification(params: URLSearchParams): WebhookResponse {
    const mode = params.get('hub.mode')
    const token = params.get('hub.verify_token')
    const challenge = params.get('hub.challenge')

    if (mode === 'subscribe' && token === this._config.verifyToken) {
      this._logger.info('Instagram webhook verified successfully')
      return { status: 200, body: challenge ?? '' }
    }

    this._logger.warn('Instagram webhook verification failed')
    return { status: 403, body: 'Forbidden' }
  }

  private async _processMessagingItem(item: any): Promise<void> {
    const incoming: IncomingMessage = {
      channel: 'instagram',
      senderId: item.sender.id,
      conversationId: item.sender.id,
      messageId: '',
      timestamp: String(item.timestamp),
      type: 'unknown',
      rawPayload: item,
    }

    if ('message' in item) {
      const msg = item as InstagramMessagingItemMessage
      if (msg.message.is_echo) return // Ignore echo messages

      incoming.messageId = msg.message.mid

      if (msg.message.text) {
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

      if (msg.message.quick_reply) {
        incoming.type = 'interactive'
        incoming.interactive = {
          type: 'button',
          id: msg.message.quick_reply.payload,
          title: msg.message.text ?? '',
        }
        incoming.text = msg.message.text
      }
    } else if ('postback' in item) {
      const pb = item as InstagramMessagingItemPostback
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
      this._logger.debug(`Instagram message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }

  private _formatCardElement(payload: CardPayload): any {
    const buttons: InstagramAction[] = []
    for (const action of payload.actions) {
      switch (action.action) {
        case 'postback':
        case 'say':
          buttons.push({ type: 'postback', title: action.label, payload: `postback:${action.value}` })
          break
        case 'url':
          buttons.push({ type: 'web_url', title: action.label, url: action.value })
          break
      }
    }
    return {
      title: payload.title,
      image_url: payload.imageUrl,
      subtitle: payload.subtitle,
      buttons,
    }
  }

  private _getChoiceMessage(payload: ChoicePayload): TextMessageWithQuickReplies {
    if (!payload.options.length) {
      return { text: payload.text }
    }
    if (payload.options.length > 13) {
      return { text: `${payload.text}\n\n${payload.options.map((o) => `- ${o.label}`).join('\n')}` }
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
