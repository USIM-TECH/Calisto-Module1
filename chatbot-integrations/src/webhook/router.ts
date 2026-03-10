import type { Request, Response, Router } from 'express'
import type { WhatsAppChannel } from '../channels/whatsapp/client.js'
import type { InstagramChannel } from '../channels/instagram/client.js'
import type { MessengerChannel } from '../channels/messenger/client.js'
import type { Logger } from '../utils/index.js'
import type { WebhookRequest } from '../types.js'

export interface WebhookRouterConfig {
  whatsapp?: WhatsAppChannel
  instagram?: InstagramChannel
  messenger?: MessengerChannel
  logger: Logger
}

/**
 * Express-based Webhook Router.
 * Routes incoming webhook requests to the appropriate channel handler.
 *
 * Expected endpoints:
 *   GET/POST /webhooks/whatsapp  → WhatsApp
 *   GET/POST /webhooks/instagram → Instagram
 *   GET/POST /webhooks/messenger → Messenger
 */
export function createWebhookRouter(
  expressRouter: Router,
  config: WebhookRouterConfig
): Router {
  const { logger } = config

  // ── Helper: Express req → WebhookRequest ────────────────────────

  function toWebhookRequest(req: Request): WebhookRequest {
    const headers: Record<string, string> = {}
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === 'string') {
        headers[key] = val
      } else if (Array.isArray(val)) {
        headers[key] = val.join(', ')
      }
    }

    // For body, use the raw body (preserved by express.json verify callback)
    // to ensure signature verification works correctly
    let body = ''
    if ((req as any).rawBody) {
      body = (req as any).rawBody
    } else if (req.body !== undefined && req.body !== null) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    return {
      method: req.method,
      path: req.path,
      headers,
      query: req.url.includes('?') ? req.url.split('?')[1]! : '',
      body,
    }
  }

  // ── WhatsApp ────────────────────────────────────────────────────

  if (config.whatsapp) {
    const whatsapp = config.whatsapp

    const whatsappHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        const result = await whatsapp.handleWebhook(webhookReq)
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`WhatsApp webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/whatsapp', whatsappHandler)
    expressRouter.post('/webhooks/whatsapp', whatsappHandler)
    logger.info('WhatsApp webhook route registered: /webhooks/whatsapp')
  }

  // ── Instagram ───────────────────────────────────────────────────

  if (config.instagram) {
    const instagram = config.instagram

    const instagramHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        const result = await instagram.handleWebhook(webhookReq)
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`Instagram webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/instagram', instagramHandler)
    expressRouter.post('/webhooks/instagram', instagramHandler)
    logger.info('Instagram webhook route registered: /webhooks/instagram')
  }

  // ── Messenger ───────────────────────────────────────────────────

  if (config.messenger) {
    const messenger = config.messenger

    const messengerHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        const result = await messenger.handleWebhook(webhookReq)
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`Messenger webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/messenger', messengerHandler)
    expressRouter.post('/webhooks/messenger', messengerHandler)
    logger.info('Messenger webhook route registered: /webhooks/messenger')
  }

  // ── Health check ────────────────────────────────────────────────

  expressRouter.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      channels: {
        whatsapp: !!config.whatsapp,
        instagram: !!config.instagram,
        messenger: !!config.messenger,
      },
      timestamp: new Date().toISOString(),
    })
  })

  return expressRouter
}
