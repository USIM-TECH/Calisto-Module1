import express, { type Express } from 'express'
import { createWebhookRouter } from '../core/webhook/index.js'
import type { ChannelIdentityRecord, RuntimeStore } from '../leads/index.js'
import {
  findConversationByCustomerId,
  findCustomerById,
  renderLeadDetailHtml,
  renderLeadsDashboardHtml,
} from '../frontend/leads-dashboard.js'

async function groupIdentitiesByCustomer(
  store: RuntimeStore,
  customerIds: string[],
): Promise<Map<string, ChannelIdentityRecord[]>> {
  const wanted = new Set(customerIds)
  const all = await store.listIdentities()
  const grouped = new Map<string, ChannelIdentityRecord[]>()
  for (const identity of all) {
    if (!wanted.has(identity.customerId)) continue
    const list = grouped.get(identity.customerId) ?? []
    list.push(identity)
    grouped.set(identity.customerId, list)
  }
  return grouped
}

async function listIdentitiesForCustomer(
  store: RuntimeStore,
  customerId: string,
): Promise<ChannelIdentityRecord[]> {
  const all = await store.listIdentities()
  return all.filter((identity) => identity.customerId === customerId)
}
import {
  renderCustomerWebchatHtml,
  renderWebchatPlaygroundHtml,
} from '../frontend/webchat-playground.js'
import { registerKnowledgeRoutes } from '../knowledge/routes.js'
import { registerProductRoutes } from '../products/routes.js'
import type { AppDependencies } from './dependencies.js'
import { createWebsiteRateLimiter } from './website-rate-limiter.js'

function applyCorsHeaders(
  req: express.Request,
  res: express.Response,
  allowedOrigins: string[],
): boolean {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
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
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }

  return false
}

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
    productStore,
    knowledgeChunkStore,
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

  app.use(['/webchat', '/reports', '/admin', '/products', '/knowledge'], (req, res, next) => {
    const handled = applyCorsHeaders(req, res, config.website.allowedOrigins)
    if (handled) return
    next()
  })

  const router = express.Router()
  createWebhookRouter(router, { whatsapp, instagram, messenger, telegram, x, logger, runtimeStore })
  app.use(router)

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

  app.get('/reports/overview', async (_req, res, next) => {
    try {
      res.json(await orchestrator.getSummary())
    } catch (error) {
      next(error)
    }
  })

  app.get('/reports/leads', async (_req, res, next) => {
    try {
      const [customers, summary, identities] = await Promise.all([
        orchestrator.listCustomers(),
        orchestrator.getSummary(),
        runtimeStore.listIdentities(),
      ])
      res.json({
        customers,
        identities,
        summary,
        services: {
          hubspot: Boolean(hubspot),
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/reports/leads-dashboard', async (_req, res, next) => {
    try {
      const [customers, conversations, summary] = await Promise.all([
        orchestrator.listCustomers(),
        orchestrator.listConversations(),
        orchestrator.getSummary(),
      ])
      const identitiesByCustomer = await groupIdentitiesByCustomer(runtimeStore, customers.map((c) => c.id))
      res.type('html').send(renderLeadsDashboardHtml({
        customers,
        identitiesByCustomer,
        conversations,
        summary,
      }))
    } catch (error) {
      next(error)
    }
  })

  if (productStore) {
    registerProductRoutes({
      app,
      store: productStore,
      logger,
      publicBaseUrl: config.publicBaseUrl,
    })
    logger.info('Product catalogue routes registered: /admin/products + /products/search')
  } else {
    app.get('/admin/products', (_req, res) => {
      res.status(503).type('html').send('<h1>Product catalogue unavailable</h1><p>Set <code>STORAGE_BACKEND=postgres</code> and restart.</p>')
    })
  }

  if (knowledgeChunkStore) {
    registerKnowledgeRoutes({ app, store: knowledgeChunkStore, logger })
    logger.info('Knowledge routes registered: /admin/knowledge + /knowledge/chunks')
  } else {
    app.get('/admin/knowledge', (_req, res) => {
      res.status(503).type('html').send('<h1>Knowledge store unavailable</h1><p>Set <code>STORAGE_BACKEND=postgres</code> and restart.</p>')
    })
  }

  app.get('/reports/leads-dashboard/:customerId', async (req, res, next) => {
    try {
      const customers = await orchestrator.listCustomers()
      const customer = findCustomerById(customers, req.params.customerId)

      if (!customer) {
        res.status(404).type('html').send('<h1>Customer not found</h1>')
        return
      }

      const [conversations, identities, interests] = await Promise.all([
        orchestrator.listConversations(),
        listIdentitiesForCustomer(runtimeStore, customer.id),
        orchestrator.listInterestsByCustomer(customer.id),
      ])
      const conversation = findConversationByCustomerId(conversations, customer.id)
      res.type('html').send(renderLeadDetailHtml({ customer, identities, conversation, interests }))
    } catch (error) {
      next(error)
    }
  })

  return app
}
