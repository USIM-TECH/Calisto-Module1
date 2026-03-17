import axios from 'axios'
import { z } from 'zod'
import {
  type InstagramRecipientId,
} from './types.js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeInstagramMessagingItem } from './incoming.js'
import { sendInstagramMessage } from './outgoing.js'
import { handleInstagramWebhook } from './webhook.js'

export interface InstagramConfig {
  accessToken: string
  instagramId: string
  verifyToken: string
  clientId: string
  clientSecret?: string
  apiVersion?: string
}

export class InstagramChannel {
  private _config: InstagramConfig
  private _logger: Logger
  private _graphApiUrl: string
  private _instagramApiUrl: string
  private _onMessage?: (message: IncomingMessage) => Promise<void>

  constructor(config: InstagramConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    const version = config.apiVersion ?? 'v21.0'
    this._graphApiUrl = `https://graph.facebook.com/${version}`
    this._instagramApiUrl = 'https://graph.instagram.com'
  }


  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  public async sendTextMessage(recipientId: string, text: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'text', text })) ?? ''
  }

  public async sendImageMessage(recipientId: string, imageUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'image', imageUrl })) ?? ''
  }

  public async sendAudioMessage(recipientId: string, audioUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'audio', audioUrl })) ?? ''
  }

  public async sendVideoMessage(recipientId: string, videoUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'video', videoUrl })) ?? ''
  }

  public async sendFileMessage(recipientId: string, fileUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'file', fileUrl })) ?? ''
  }


  public async sendLocationMessage(recipientId: string, latitude: number, longitude: number): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'location', latitude, longitude })) ?? ''
  }


  public async replyToComment(commentId: string, text: string): Promise<string> {
    const fields = new URLSearchParams({ message: text })
    const url = `${this._graphApiUrl}/${commentId}/replies?${fields.toString()}`
    const response = await axios.post<{ id: string }>(url, {}, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })
    const { id } = z.object({ id: z.string() }).parse(response.data)
    return id
  }

  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    return sendInstagramMessage(recipientId, message, this._logger, async (recipient, rawMessage) => {
      return this._sendMessage(recipient, rawMessage)
    })
  }

  public async getUserProfile(instagramUserId: string): Promise<{ id: string; name: string; username: string }> {
    const query = new URLSearchParams({
      access_token: this._config.accessToken,
      fields: 'id,name,username',
    })
    const url = `${this._graphApiUrl}/${instagramUserId}?${query.toString()}`
    const response = await axios.get(url)
    return response.data
  }

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
    res = await axios.get(`${this._instagramApiUrl}/access_token?${query.toString()}`)
    const { access_token, expires_in } = z.object({ access_token: z.string(), expires_in: z.number() }).parse(res.data)

    return { accessToken: access_token, expirationTime: Date.now() + expires_in * 1000 }
  }

  public async refreshAccessToken(): Promise<{ accessToken: string; expirationTime: number }> {
    const query = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: this._config.accessToken,
    })
    const response = await axios.get(`${this._instagramApiUrl}/refresh_access_token?${query.toString()}`)
    const { access_token, expires_in } = z.object({ access_token: z.string(), expires_in: z.number() }).parse(response.data)
    return { accessToken: access_token, expirationTime: Date.now() + expires_in * 1000 }
  }

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


  private async _sendMessage(recipient: InstagramRecipientId, message: any): Promise<{ recipient_id: string; message_id: string }> {
    const url = `${this._graphApiUrl}/${this._config.instagramId}/messages`
    const payload = {
      recipient,
      messaging_type: 'RESPONSE',
      message,
    }

    this._logger.debug(`[Instagram] Sending message to ${'id' in recipient ? recipient.id : recipient.comment_id}: ${JSON.stringify(message)}`)

    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })

    this._logger.debug(`[Instagram] Send response: ${JSON.stringify(response.data)}`)
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
