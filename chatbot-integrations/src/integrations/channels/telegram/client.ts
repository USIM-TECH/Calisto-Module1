import axios from 'axios'
import type { IncomingMessage, OutgoingMessage, WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { normalizeTelegramUpdate } from './incoming.js'
import { buildTelegramSendPayload } from './outgoing.js'
import type { TelegramUpdate } from './types.js'
import { handleTelegramWebhook } from './webhook.js'

export interface TelegramConfig {
  botToken: string
  secretToken?: string
  apiBaseUrl?: string
}

export class TelegramChannel {
  private readonly _config: TelegramConfig
  private readonly _logger: Logger
  private readonly _baseUrl: string
  private _onMessage?: (message: IncomingMessage) => Promise<void>

  constructor(config: TelegramConfig, logger: Logger) {
    this._config = config
    this._logger = logger
    this._baseUrl = `${config.apiBaseUrl ?? 'https://api.telegram.org'}/bot${config.botToken}`
  }

  public onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this._onMessage = handler
  }

  public async sendTextMessage(chatId: string, text: string): Promise<string | undefined> {
    const response = await axios.post(`${this._baseUrl}/sendMessage`, {
      chat_id: chatId,
      text,
    })
    return response.data?.result?.message_id?.toString()
  }

  public async sendMessage(chatId: string, message: OutgoingMessage): Promise<string | undefined> {
    const payload = buildTelegramSendPayload(chatId, message)
    if (!payload) {
      this._logger.warn(`Unsupported outgoing message type for Telegram: ${(message as any).type}`)
      return undefined
    }

    const response = await axios.post(`${this._baseUrl}/sendMessage`, payload)
    return response.data?.result?.message_id?.toString()
  }

  public async setWebhook(webhookUrl: string): Promise<void> {
    await axios.post(`${this._baseUrl}/setWebhook`, {
      url: webhookUrl,
      secret_token: this._config.secretToken,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
    })
  }

  public async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await axios.post(`${this._baseUrl}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
    })
  }

  public async handleWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    return handleTelegramWebhook({
      config: this._config,
      logger: this._logger,
      req,
      onUpdate: async (update) => {
        await this._processUpdate(update)
      },
    })
  }

  private async _processUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query?.id) {
      try {
        await this.answerCallbackQuery(update.callback_query.id)
      } catch (error: any) {
        this._logger.warn(`Failed to answer Telegram callback query ${update.callback_query.id}: ${error.message}`)
      }
    }

    const incoming = normalizeTelegramUpdate(update)
    if (!incoming) {
      return
    }

    if (this._onMessage) {
      await this._onMessage(incoming)
    } else {
      this._logger.debug(`Telegram message received but no handler registered: ${JSON.stringify(incoming)}`)
    }
  }
}
