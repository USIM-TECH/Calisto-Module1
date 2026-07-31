import axios from 'axios'
import { WhatsAppAPI } from 'whatsapp-api-js'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeWhatsAppIncomingMessage } from './incoming.js'
import { sendWhatsAppMessage } from './outgoing.js'
import { handleWhatsAppWebhook } from './webhook.js'

export interface WhatsAppConfig {
  accessToken: string
  phoneNumberId: string
  verifyToken: string
  clientSecret?: string
  apiVersion?: string
}

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

  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  public async sendMessage(recipientPhone: string, message: OutgoingMessage): Promise<string | undefined> {
    return sendWhatsAppMessage(this._client, this._config, this._logger, recipientPhone, message)
  }

  public async getMediaUrl(mediaId: string): Promise<string> {
    const apiVersion = this._config.apiVersion ?? 'v22.0'
    const { data } = await axios.get(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this._config.accessToken}` },
    })
    return data.url
  }

  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    return handleWhatsAppWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onMessage: async (message, value) => {
        await this._processIncomingMessage(message, value)
      },
    })
  }

  private async _processIncomingMessage(message: any, value: any): Promise<void> {
    const incoming = await normalizeWhatsAppIncomingMessage(
      message,
      value,
      async (mediaId) => this.getMediaUrl(mediaId)
    )
    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`WhatsApp message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }
}
