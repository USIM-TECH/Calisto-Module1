import type { WebhookRequest, WebhookResponse } from '../../../core/types.js'
import { validateMetaSignature, type Logger } from '../../../core/utils/index.js'
import { WhatsAppPayloadSchema, type WhatsAppMessageValue, type WhatsAppPayload } from './types.js'
import type { WhatsAppConfig } from './client.js'

interface HandleWhatsAppWebhookArgs {
  config: WhatsAppConfig
  logger: Logger
  req: WebhookRequest
  onMessage: (message: any, value: WhatsAppMessageValue) => Promise<void>
}

export async function handleWhatsAppWebhook({
  config,
  logger,
  req,
  onMessage,
}: HandleWhatsAppWebhookArgs): Promise<WebhookResponse> {
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
        logger.error(`WhatsApp webhook signature validation failed: ${error}`)
        return { status: 401, body: error }
      }
    }

    if (!req.body) {
      logger.debug('WhatsApp webhook received empty body')
      return { status: 200 }
    }

    let payload: WhatsAppPayload
    try {
      payload = WhatsAppPayloadSchema.parse(JSON.parse(req.body))
    } catch (error: any) {
      logger.error('Failed to parse WhatsApp webhook payload:', error.message)
      return { status: 400, body: 'Invalid payload' }
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') {
          continue
        }

        for (const status of change.value.statuses ?? []) {
          if (status.status === 'failed') {
            const reason = (status.errors ?? [])
              .map(
                (e) =>
                  `[${e.code}] ${e.title}: ${e.message}` +
                  (e.error_data?.details ? ` — ${e.error_data.details}` : '')
              )
              .join('; ')
            logger.error(
              `WhatsApp message ${status.id} FAILED${reason ? `: ${reason}` : ' (no error detail provided)'}`
            )
          } else {
            logger.debug(`WhatsApp message ${status.id} status: ${status.status}`)
          }
        }

        for (const message of change.value.messages ?? []) {
          await onMessage(message, change.value)
        }
      }
    }

    return { status: 200 }
  } catch (error: any) {
    logger.error(`WhatsApp webhook error: ${error.message}`)
    return { status: 500, body: 'Internal error' }
  }
}

function handleVerification(
  config: WhatsAppConfig,
  logger: Logger,
  params: URLSearchParams
): WebhookResponse {
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === config.verifyToken) {
    logger.info('WhatsApp webhook verified successfully')
    return { status: 200, body: challenge ?? '' }
  }

  logger.warn('WhatsApp webhook verification failed')
  return { status: 403, body: 'Forbidden' }
}
