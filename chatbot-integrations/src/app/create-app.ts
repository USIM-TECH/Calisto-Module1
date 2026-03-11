import express, { type Express } from 'express'
import { createWebhookRouter } from '../core/webhook/index.js'
import type { AppDependencies } from './dependencies.js'

export function createApp(dependencies: AppDependencies): Express {
  const {
    config,
    logger,
    nlpClient,
    whatsapp,
    instagram,
    messenger,
    telegram,
    x,
    hubspot,
  } = dependencies

  const app = express()

  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString()
    },
  }))

  const router = express.Router()
  createWebhookRouter(router, { whatsapp, instagram, messenger, telegram, x, logger })
  app.use(router)

  app.get('/', (_req, res) => {
    res.json({
      name: 'chatbot-integrations',
      channels: {
        whatsapp: Boolean(whatsapp),
        instagram: Boolean(instagram),
        messenger: Boolean(messenger),
        telegram: Boolean(telegram),
        x: Boolean(x),
      },
      services: {
        hubspot: Boolean(hubspot),
      },
      nlp: {
        rasaUrl: config.rasaUrl,
      },
      endpoints: {
        health: '/health',
        whatsapp: whatsapp ? '/webhooks/whatsapp' : null,
        instagram: instagram ? '/webhooks/instagram' : null,
        messenger: messenger ? '/webhooks/messenger' : null,
        telegram: telegram ? '/webhooks/telegram' : null,
        x: x ? '/webhooks/x' : null,
      },
    })
  })

  app.get('/health', async (_req, res) => {
    const nlpHealth = await nlpClient.healthCheck()
    res.json({
      server: 'ok',
      nlp: nlpHealth,
      channels: {
        whatsapp: Boolean(whatsapp),
        instagram: Boolean(instagram),
        messenger: Boolean(messenger),
        telegram: Boolean(telegram),
        x: Boolean(x),
      },
    })
  })

  return app
}
