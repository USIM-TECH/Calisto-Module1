import type { WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { telegramUpdateSchema } from './types.js'
import type { TelegramConfig } from './client.js'

interface HandleTelegramWebhookArgs {
  config: TelegramConfig
  logger: Logger
  req: WebhookRequest
  onUpdate: (update: ReturnType<typeof telegramUpdateSchema.parse>) => Promise<void>
}

export async function handleTelegramWebhook({
  config,
  logger,
  req,
  onUpdate,
}: HandleTelegramWebhookArgs): Promise<WebhookResponse> {
  try {
    const secret = config.secretToken.trim()
    if (!secret) {
      logger.error('Telegram webhook rejected because no secret token is configured')
      return { status: 503, body: 'Telegram webhook secret token is not configured' }
    }
    const header = req.headers['x-telegram-bot-api-secret-token']
    if (header !== secret) {
      logger.error('Telegram webhook secret token validation failed')
      return { status: 401, body: 'Invalid secret token' }
    }

    if (!req.body) {
      return { status: 200 }
    }

    const parsed = telegramUpdateSchema.safeParse(JSON.parse(req.body))
    if (!parsed.success) {
      logger.warn(`Unsupported Telegram update payload: ${parsed.error.message}`)
      return { status: 200 }
    }

    await onUpdate(parsed.data)
    return { status: 200 }
  } catch (error: any) {
    logger.error(`Telegram webhook error: ${error.message}`)
    return { status: 500, body: 'Internal error' }
  }
}
