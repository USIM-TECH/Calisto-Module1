import express, { type Express } from 'express'
import { createWebhookRouter } from '../core/webhook/index.js'
import type { AppDependencies } from './dependencies.js'
import { renderWebchatPlaygroundHtml } from './webchat-playground.js'

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
    website,
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

  app.use('/webchat', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
    if (_req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  app.get('/webchat/test', (_req, res) => {
    res.type('html').send(renderWebchatPlaygroundHtml())
  })

  app.post('/webchat/message', async (req, res) => {
    try {
      const payload = website.parseRequest(req.body)
      const response = await website.handleChat(payload)
      res.json(response)
    } catch (error: any) {
      logger.error(`Website chat route error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/', (_req, res) => {
    res.json({
      name: 'chatbot-integrations',
      channels: {
        whatsapp: Boolean(whatsapp),
        instagram: Boolean(instagram),
        messenger: Boolean(messenger),
        telegram: Boolean(telegram),
        x: Boolean(x),
        website: true,
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
        website: '/webchat/message',
        websitePlayground: '/webchat/test',
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
        website: true,
      },
    })
  })

  return app
}
