import type { WebhookRequest, WebhookResponse } from '../../../core/types.js'
import { validateMetaSignature, type Logger } from '../../../core/utils/index.js'
import { messengerPayloadSchema, type MessengerPayload } from './types.js'
import type { MessengerConfig } from './client.js'

interface HandleMessengerWebhookArgs {
  config: MessengerConfig
  logger: Logger
  req: WebhookRequest
  onMessagingItem: (item: any) => Promise<void>
}

export async function handleMessengerWebhook({
  config,
  logger,
  req,
  onMessagingItem,
}: HandleMessengerWebhookArgs): Promise<WebhookResponse> {
  try {
    const queryParams = new URLSearchParams(req.query)
    if (queryParams.has('hub.mode')) {
      return handleVerification(config, logger, queryParams)
    }

    if (config.clientSecret) {
      const { valid, error } = validateMetaSignature(
        req.body,
        req.headers['x-hub-signature-256'],
        config.clientSecret
      )
      if (!valid) {
        logger.error(`Messenger webhook signature validation failed: ${error}`)
        return { status: 401, body: error }
      }
    }

    if (!req.body) {
      logger.warn('Messenger handler received empty body')
      return { status: 200 }
    }

    let payload: MessengerPayload
    try {
      const parsed = JSON.parse(req.body)
      const result = messengerPayloadSchema.safeParse(parsed)
      if (!result.success) {
        logger.warn('Unsupported Messenger event payload: ' + result.error.message)
        return { status: 200 }
      }
      payload = result.data
    } catch {
      return { status: 400, body: 'Invalid JSON payload' }
    }

    for (const entry of payload.entry) {
      if ('messaging' in entry) {
        for (const item of entry.messaging) {
          await onMessagingItem(item)
        }
      }
    }

    return { status: 200 }
  } catch (error: any) {
    logger.error(`Messenger webhook error: ${error.message}`)
    return { status: 500, body: 'Internal error' }
  }
}

function handleVerification(
  config: MessengerConfig,
  logger: Logger,
  params: URLSearchParams
): WebhookResponse {
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === config.verifyToken) {
    logger.info('Messenger webhook verified successfully')
    return { status: 200, body: challenge ?? '' }
  }

  logger.warn('Messenger webhook verification failed')
  return { status: 403, body: 'Forbidden' }
}
