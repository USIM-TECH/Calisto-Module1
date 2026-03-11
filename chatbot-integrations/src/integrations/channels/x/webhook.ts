import type { WebhookRequest, WebhookResponse } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import { createWebhookCrcResponse, verifyWebhookSignature } from './oauth.js'
import { type XDirectMessageEvent, type XWebhookPayload, xWebhookPayloadSchema } from './types.js'
import type { XConfig } from './client.js'

interface HandleXWebhookArgs {
  config: XConfig
  logger: Logger
  req: WebhookRequest
  onDirectMessageEvent: (payload: XWebhookPayload, event: XDirectMessageEvent) => Promise<void>
}

export async function handleXWebhook({
  config,
  logger,
  req,
  onDirectMessageEvent,
}: HandleXWebhookArgs): Promise<WebhookResponse> {
  try {
    const queryParams = new URLSearchParams(req.query)
    const crcToken = queryParams.get('crc_token')
    if (crcToken) {
      return {
        status: 200,
        body: JSON.stringify({ response_token: createWebhookCrcResponse(crcToken, config.consumerSecret) }),
        headers: { 'content-type': 'application/json' },
      }
    }

    if (req.body) {
      const signature = req.headers['x-twitter-webhooks-signature']
      if (!signature) {
        logger.error('X webhook signature header missing')
        return { status: 401, body: 'Missing signature' }
      }

      const valid = verifyWebhookSignature(req.body, signature, config.consumerSecret)
      if (!valid) {
        logger.error('X webhook signature validation failed')
        return { status: 401, body: 'Invalid signature' }
      }
    }

    if (!req.body) {
      return { status: 200 }
    }

    const parsed = xWebhookPayloadSchema.safeParse(JSON.parse(req.body))
    if (!parsed.success) {
      logger.warn(`Unsupported X webhook payload: ${parsed.error.message}`)
      return { status: 200 }
    }

    for (const event of parsed.data.direct_message_events ?? []) {
      await onDirectMessageEvent(parsed.data, event)
    }

    return { status: 200 }
  } catch (error: any) {
    logger.error(`X webhook error: ${error.message}`)
    return { status: 500, body: 'Internal error' }
  }
}
