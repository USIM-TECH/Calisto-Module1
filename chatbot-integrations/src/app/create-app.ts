import express, { type Express } from 'express'
import { createWebhookRouter } from '../core/webhook/index.js'
import {
  findConversationByLeadId,
  findLeadById,
  renderLeadDetailHtml,
  renderLeadsDashboardHtml,
} from '../frontend/leads-dashboard.js'
import {
  renderCustomerWebchatHtml,
  renderWebchatPlaygroundHtml,
} from '../frontend/webchat-playground.js'
import type { AppDependencies } from './dependencies.js'
import { createWebsiteRateLimiter } from './website-rate-limiter.js'

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
    orchestrator,
    runtimeStore,
  } = dependencies

  const app = express()
  const websiteRateLimiter = createWebsiteRateLimiter(
    config.website.rateLimitMax,
    config.website.rateLimitWindowMs,
  )

  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString()
    },
  }))

  const router = express.Router()
  createWebhookRouter(router, { whatsapp, instagram, messenger, telegram, x, logger, runtimeStore })
  app.use(router)

  app.use('/webchat', (_req, res, next) => {
    const origin = typeof _req.headers.origin === 'string' ? _req.headers.origin : undefined
    const allowedOrigins = config.website.allowedOrigins
    const allowAllOrigins = allowedOrigins.length === 0
    if (allowAllOrigins && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] ?? '*')
    } else if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

  app.get('/webchat', (_req, res) => {
    res.type('html').send(renderCustomerWebchatHtml())
  })

  app.post('/webchat/message', async (req, res) => {
    try {
      const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
      if (config.website.authToken && authHeader !== `Bearer ${config.website.authToken}`) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const rateLimitKey = `${req.ip}:${req.body?.senderId ?? 'anonymous'}`
      if (!websiteRateLimiter.allow(rateLimitKey)) {
        res.status(429).json({ error: 'Rate limit exceeded' })
        return
      }

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
        websiteCustomerChat: '/webchat',
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

  app.get('/reports/overview', (_req, res) => {
    res.json(orchestrator.getSummary())
  })

  app.get('/reports/leads', (_req, res) => {
    res.json({
      leads: orchestrator.listLeads(),
      services: {
        hubspot: Boolean(hubspot),
      },
    })
  })

  app.get('/reports/leads-dashboard', (_req, res) => {
    res.type('html').send(renderLeadsDashboardHtml({
      leads: orchestrator.listLeads(),
      conversations: orchestrator.listConversations(),
      summary: orchestrator.getSummary(),
    }))
  })

  app.get('/reports/leads-dashboard/:leadId', (req, res) => {
    const leads = orchestrator.listLeads()
    const lead = findLeadById(leads, req.params.leadId)

    if (!lead) {
      res.status(404).type('html').send('<h1>Lead not found</h1>')
      return
    }

    const conversation = findConversationByLeadId(orchestrator.listConversations(), lead.id)
    res.type('html').send(renderLeadDetailHtml({ lead, conversation }))
  })

  return app
}
