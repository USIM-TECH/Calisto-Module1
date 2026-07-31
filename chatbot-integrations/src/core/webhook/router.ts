import type { Request, Response, Router } from 'express'
import type { ChannelAccountRegistry } from '../../channel-accounts/index.js'
import { handleMetaChannelWebhook } from '../../channel-accounts/meta-webhook.js'
import type { TelegramChannel } from '../../integrations/channels/telegram/client.js'
import type { XChannel } from '../../integrations/channels/x/client.js'
import type { Logger } from '../utils/index.js'
import type { WebhookRequest } from '../types.js'
import type { RuntimeStore } from '../../leads/storage/runtime-store.interface.js'

export interface WebhookRouterConfig {
  registry: ChannelAccountRegistry
  x?: XChannel
  logger: Logger
  runtimeStore: RuntimeStore
}

export function createWebhookRouter(
  expressRouter: Router,
  config: WebhookRouterConfig
): Router {
  const { logger, runtimeStore, registry } = config

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

  const whatsappAccounts = () => registry.listByChannel('whatsapp')
  const instagramAccounts = () => registry.listByChannel('instagram')
  const messengerAccounts = () => registry.listByChannel('messenger')

  const whatsappHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        await runtimeStore.appendWebhookEvent({
          channel: 'whatsapp',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
        const result = await handleMetaChannelWebhook(
          'whatsapp',
          whatsappAccounts(),
          logger,
          webhookReq,
          async (account, routedReq) => account.client.handleWebhook(routedReq),
        )
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`WhatsApp webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/whatsapp', whatsappHandler)
    expressRouter.post('/webhooks/whatsapp', whatsappHandler)
    logger.info('WhatsApp webhook route registered: /webhooks/whatsapp')

  const instagramHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        await runtimeStore.appendWebhookEvent({
          channel: 'instagram',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
        const result = await handleMetaChannelWebhook(
          'instagram',
          instagramAccounts(),
          logger,
          webhookReq,
          async (account, routedReq) => account.client.handleWebhook(routedReq),
        )
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`Instagram webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/instagram', instagramHandler)
    expressRouter.post('/webhooks/instagram', instagramHandler)
    logger.info('Instagram webhook route registered: /webhooks/instagram')

  const messengerHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        await runtimeStore.appendWebhookEvent({
          channel: 'messenger',
          direction: 'inbound',
          path: req.path,
          sourceId: req.ip ?? 'unknown',
          conversationId: 'webhook',
          payload: req.body,
        })
        const result = await handleMetaChannelWebhook(
          'messenger',
          messengerAccounts(),
          logger,
          webhookReq,
          async (account, routedReq) => account.client.handleWebhook(routedReq),
        )
        res.status(result.status).send(result.body ?? '')
      } catch (error: any) {
        logger.error(`Messenger webhook route error: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    }

    expressRouter.get('/webhooks/messenger', messengerHandler)
    expressRouter.post('/webhooks/messenger', messengerHandler)
    logger.info('Messenger webhook route registered: /webhooks/messenger')

  const telegramHandler = async (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId
      const account = registry.getById(accountId)
      if (!account || account.record.channel !== 'telegram') {
        res.status(404).send('Unknown Telegram account')
        return
      }

      const webhookReq = toWebhookRequest(req)
      await runtimeStore.appendWebhookEvent({
        channel: 'telegram',
        direction: 'inbound',
        path: req.path,
        sourceId: req.ip ?? 'unknown',
        conversationId: 'webhook',
        payload: req.body,
      })
      const result = await (account.client as TelegramChannel).handleWebhook(webhookReq)
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

  expressRouter.post('/webhooks/telegram/:accountId', telegramHandler)
  logger.info('Telegram webhook route registered: /webhooks/telegram/:accountId')

  if (config.x) {
    const x = config.x

    const xHandler = async (req: Request, res: Response) => {
      try {
        const webhookReq = toWebhookRequest(req)
        await runtimeStore.appendWebhookEvent({
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
    const accounts = registry.list()
    res.json({
      status: 'ok',
      channels: {
        whatsapp: accounts.filter((a) => a.record.channel === 'whatsapp').length,
        instagram: accounts.filter((a) => a.record.channel === 'instagram').length,
        messenger: accounts.filter((a) => a.record.channel === 'messenger').length,
        telegram: accounts.filter((a) => a.record.channel === 'telegram').length,
        x: Boolean(config.x),
      },
      timestamp: new Date().toISOString(),
    })
  })

  return expressRouter
}
