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
    return (await this.sendMessage(recipientId, { type: 'text', text })) ?? ''
  }

  /** Send an image message */
  public async sendImage(recipientId: string, imageUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'image', imageUrl })) ?? ''
  }

  /** Send an audio message */
  public async sendAudio(recipientId: string, audioUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'audio', audioUrl })) ?? ''
  }

  /** Send a video message */
  public async sendVideo(recipientId: string, videoUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'video', videoUrl })) ?? ''
  }

  /** Send a file message */
  public async sendFile(recipientId: string, fileUrl: string): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'file', fileUrl })) ?? ''
  }

  /** Send a location as Google Maps link */
  public async sendLocation(recipientId: string, latitude: number, longitude: number): Promise<string> {
    return (await this.sendMessage(recipientId, { type: 'location', latitude, longitude })) ?? ''
  }

  /** Send an outgoing message (dispatches by type) */
  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    return sendMessengerMessage(recipientId, message, this._logger, async (id, rawMessage) => {
      return this._sendViaApi(id, rawMessage)
    })
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
    return handleMessengerWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onMessagingItem: async (item) => {
        await this._processMessagingItem(item)
      },
    })
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

  private async _processMessagingItem(item: any): Promise<void> {
    const incoming = normalizeMessengerMessagingItem(item)
    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`Messenger message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }
}
