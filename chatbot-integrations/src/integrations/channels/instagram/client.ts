import axios from 'axios'
import { z } from 'zod'
import {
  type InstagramRecipientId,
} from './types.js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeInstagramMessagingItem } from './incoming.js'
import { buildInstagramChoiceMessage } from './outgoing.js'
import { handleInstagramWebhook } from './webhook.js'

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
        const choiceMsg = buildInstagramChoiceMessage(message)
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
    return handleInstagramWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onMessagingItem: async (item) => {
        await this._processMessagingItem(item)
      },
    })
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private async _sendMessage(recipient: InstagramRecipientId, message: any): Promise<{ recipient_id: string; message_id: string }> {
    const url = `${this._baseUrl}/${this._config.instagramId}/messages`
    const response = await axios.post(url, { recipient, message }, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })
    return response.data
  }

  private async _processMessagingItem(item: any): Promise<void> {
    const incoming = normalizeInstagramMessagingItem(item)
    if (!incoming) {
      return
    }

    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`Instagram message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }

}
