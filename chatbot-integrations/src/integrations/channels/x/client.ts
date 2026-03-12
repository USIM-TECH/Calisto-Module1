import axios from 'axios'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeXDirectMessageEvent } from './incoming.js'
import { createOAuthHeader } from './oauth.js'
import { normalizeXOutgoingText } from './outgoing.js'
import { handleXWebhook } from './webhook.js'
import type { XDirectMessageEvent, XWebhookPayload } from './types.js'

export interface XConfig {
  consumerKey: string
  consumerSecret: string
  accessToken: string
  accessTokenSecret: string
  apiBaseUrl?: string
}

export class XChannel {
  private readonly _config: XConfig
  private readonly _logger: Logger
  private readonly _baseUrl: string
  private _onMessage?: (message: IncomingMessage) => Promise<void>

  constructor(config: XConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    this._baseUrl = config.apiBaseUrl ?? 'https://api.x.com/1.1'
  }

  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  public async sendTextMessage(recipientId: string, text: string): Promise<string | undefined> {
    const url = `${this._baseUrl}/direct_messages/events/new.json`
    const authHeader = createOAuthHeader({
      method: 'POST',
      url,
      consumerKey: this._config.consumerKey,
      consumerSecret: this._config.consumerSecret,
      accessToken: this._config.accessToken,
      accessTokenSecret: this._config.accessTokenSecret,
    })

    const response = await axios.post(
      url,
      {
        event: {
          type: 'message_create',
          message_create: {
            target: { recipient_id: recipientId },
            message_data: { text },
          },
        },
      },
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      }
    )

    return response.data?.event?.id
  }

  public async sendMessage(recipientId: string, message: OutgoingMessage): Promise<string | undefined> {
    const text = normalizeXOutgoingText(message)
    if (!text) {
      this._logger.warn(`Unsupported outgoing message type for X: ${(message as any).type}`)
      return undefined
    }

    return this.sendTextMessage(recipientId, text)
  }

  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    return handleXWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onDirectMessageEvent: async (payload, event) => {
        await this._processDirectMessageEvent(payload, event as XDirectMessageEvent)
      },
    })
  }

  private async _processDirectMessageEvent(payload: XWebhookPayload, event: XDirectMessageEvent): Promise<void> {
    const incoming = normalizeXDirectMessageEvent(event, payload)
    if (!incoming) {
      return
    }

    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`X message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }
}
