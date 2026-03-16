import axios from 'axios'
import { z } from 'zod'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeMessengerMessagingItem } from './incoming.js'
import { sendMessengerMessage } from './outgoing.js'
import { handleMessengerWebhook } from './webhook.js'

export interface MessengerConfig {
  pageAccessToken: string
  pageId: string
  verifyToken: string
  clientId: string
  clientSecret?: string
  appToken?: string
  apiVersion?: string
}

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

  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  public async sendText(recipientId: string, text: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'text', text })) ?? ''
  }

  public async sendImage(recipientId: string, imageUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'image', imageUrl })) ?? ''
  }

  public async sendAudio(recipientId: string, audioUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'audio', audioUrl })) ?? ''
  }

  public async sendVideo(recipientId: string, videoUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'video', videoUrl })) ?? ''
  }

  public async sendFile(recipientId: string, fileUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'file', fileUrl })) ?? ''
  }

  public async sendLocation(recipientId: string, latitude: number, longitude: number): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'location', latitude, longitude })) ?? ''
  }

  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    return sendMessengerMessage(recipientId, message, this._logger, async (id, rawMessage) => {
      return this._sendViaApi(id, rawMessage)
    })
  }

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

  public async unsubscribeFromWebhooks(): Promise<void> {
    const response = await axios.delete(
      `${this._baseUrl}/${this._config.pageId}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${this._config.pageAccessToken}` } }
    )
    if (!response.data?.success) {
      throw new Error('Failed to unsubscribe from webhooks')
    }
  }

  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    return handleMessengerWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onMessagingItem: async (item) => {
        await this._processMessagingItem(item)
      },
    })
  }

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

  private async _processMessagingItem(item: any): Promise<void> {
    const incoming = normalizeMessengerMessagingItem(item)
    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`Messenger message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }
}
