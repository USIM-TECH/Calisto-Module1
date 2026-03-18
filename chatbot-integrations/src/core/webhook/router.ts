import type { Request, Response, Router } from 'express'
import type { InstagramChannel } from '../../integrations/channels/instagram/client.js'
import type { MessengerChannel } from '../../integrations/channels/messenger/client.js'
import type { TelegramChannel } from '../../integrations/channels/telegram/client.js'
import type { WhatsAppChannel } from '../../integrations/channels/whatsapp/client.js'
import type { XChannel } from '../../integrations/channels/x/client.js'
import type { Logger } from '../utils/index.js'
import type { WebhookRequest } from '../types.js'
import type { RuntimeStore } from '../../leads/index.js'

export interface WebhookRouterConfig {
  whatsapp?: WhatsAppChannel
  instagram?: InstagramChannel
  messenger?: MessengerChannel
  telegram?: TelegramChannel
  x?: XChannel
  logger: Logger
  runtimeStore: RuntimeStore
}

export function createWebhookRouter(
  expressRouter: Router,
  config: WebhookRouterConfig
): Router {
  const { logger, runtimeStore } = config

  function toWebhookRequest(req: Request): WebhookRequest {
    const headers: Record<string, string> = {}
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === 'string') {
        headers[key] = val
      } else if (Array.isArray(val)) {
        headers[key] = val.join(', ')
      }
    }
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

  if (config.whatsapp) {
    const whatsapp = config.whatsapp

    const whatsappHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        runtimeStore.appendWebhookEvent({
          channel: 'whatsapp',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
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


  if (config.instagram) {
    const instagram = config.instagram

    const instagramHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        runtimeStore.appendWebhookEvent({
          channel: 'instagram',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
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

  if (config.messenger) {
    const messenger = config.messenger

    const messengerHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        runtimeStore.appendWebhookEvent({
          channel: 'messenger',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
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

  if (config.telegram) {
    const telegram = config.telegram

    const telegramHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        runtimeStore.appendWebhookEvent({
          channel: 'telegram',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
        const result = await telegram.handleWebhook(webhookReq)
        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value)
          }
        }
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`Telegram webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.post('/webhooks/telegram', telegramHandler)
    logger.info('Telegram webhook route registered: /webhooks/telegram')
  }

  if (config.x) {
    const x = config.x

    const xHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        runtimeStore.appendWebhookEvent({
          channel: 'x',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
        const result = await x.handleWebhook(webhookReq)
        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value)
          }
        }
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`X webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/x', xHandler)
    expressRouter.post('/webhooks/x', xHandler)
    logger.info('X webhook route registered: /webhooks/x')
  }

  expressRouter.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      channels: {
        whatsapp: !!config.whatsapp,
        instagram: !!config.instagram,
        messenger: !!config.messenger,
        telegram: !!config.telegram,
        x: !!config.x,
      },
      timestamp: new Date().toISOString(),
    })
  })

  return expressRouter
}
