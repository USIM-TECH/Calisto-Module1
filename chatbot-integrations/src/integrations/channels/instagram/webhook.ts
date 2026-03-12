import type { WebhookRequest, WebhookResponse } from '../../../core/types.js'
import { validateMetaSignature, type Logger } from '../../../core/utils/index.js'
import { instagramPayloadSchema, type InstagramPayload } from './types.js'
import type { InstagramConfig } from './client.js'

interface HandleInstagramWebhookArgs {
  config: InstagramConfig
  logger: Logger
  req: WebhookRequest
  onMessagingItem: (item: any) => Promise<void>
}

export async function handleInstagramWebhook({
  config,
  logger,
  req,
  onMessagingItem,
}: HandleInstagramWebhookArgs): Promise<WebhookResponse> {
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
        logger.error(`Instagram webhook signature validation failed: ${error}`)
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
        logger.warn('Unsupported Instagram event payload: ' + result.error.message)
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
    logger.error(`Instagram webhook error: ${error.message}`)
    return { status: 500, body: 'Internal error' }
  }
}

function handleVerification(
  config: InstagramConfig,
  logger: Logger,
  params: URLSearchParams
): WebhookResponse {
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === config.verifyToken) {
    logger.info('Instagram webhook verified successfully')
    return { status: 200, body: challenge ?? '' }
  }

  logger.warn('Instagram webhook verification failed')
  return { status: 403, body: 'Forbidden' }
}
