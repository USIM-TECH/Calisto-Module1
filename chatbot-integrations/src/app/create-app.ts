import express, { type Express } from 'express'
import { createWebhookRouter } from '../core/webhook/index.js'
import type { ChannelIdentityRecord, ConversationRecord, RuntimeStore } from '../leads/index.js'

function findConversationsByCustomerId(
  conversations: ConversationRecord[],
  customerId: string,
): ConversationRecord[] {
  return conversations
    .filter((entry) => entry.customerId === customerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function listIdentitiesForCustomer(
  store: RuntimeStore,
  customerId: string,
): Promise<ChannelIdentityRecord[]> {
  const all = await store.listIdentities()
  return all.filter((identity) => identity.customerId === customerId)
}

async function loadLeadDetailPayload(
  runtimeStore: RuntimeStore,
  customerId: string,
): Promise<{
  customer: NonNullable<Awaited<ReturnType<RuntimeStore['getCustomer']>>>
  identities: ChannelIdentityRecord[]
  interests: Awaited<ReturnType<RuntimeStore['listInterestsByCustomer']>>
  conversation?: ConversationRecord
  conversations: ConversationRecord[]
  transcript: NonNullable<ConversationRecord['messages']>
  crm: {
    status: 'pending' | 'synced' | 'failed'
    recordId?: string
  }
}> {
  const customer = await runtimeStore.getCustomer(customerId)
  if (!customer) {
    throw new Error('Customer not found')
  }

  const [allConversations, identities, interests] = await Promise.all([
    runtimeStore.listConversations(),
    listIdentitiesForCustomer(runtimeStore, customer.id),
    runtimeStore.listInterestsByCustomer(customer.id),
  ])

  // A customer can be merged across channels (e.g. WhatsApp + Instagram), so
  // return every per-channel conversation. The most recent stays as the default
  // `conversation`/`transcript` for backward compatibility.
  const conversations = findConversationsByCustomerId(allConversations, customer.id)
  const conversation = conversations[0]

  return {
    customer,
    identities,
    interests,
    conversation,
    conversations,
    transcript: conversation?.messages ?? [],
    crm: {
      status: customer.crmStatus,
      recordId: customer.crmRecordId,
    },
  }
}
import { registerKnowledgeRoutes } from '../knowledge/routes.js'
import { registerPresetRoutes, registerProductRoutes, registerStoreRoutes } from '../products/routes.js'
import { registerChannelAccountRoutes, ChannelAccountRegistry } from '../channel-accounts/index.js'
import { createAdminAuthMiddleware } from '../core/auth/admin-auth.js'
import type { AppDependencies } from './dependencies.js'
import { createWebsiteRateLimiter } from './website-rate-limiter.js'
import { normaliseEmail, normalisePhone } from '../leads/storage/helpers.js'
import { absolutizeOutgoingMessages } from '../core/utils/absolutize-outgoing-messages.js'
import { CACHE_KEYS, invalidateLeadsCache, isRedisConnected } from '../cache/index.js'

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
    cacheService,
    nlpClient,
    channelAccountService,
    x,
    website,
    hubspot,
    orchestrator,
    runtimeStore,
    productStore,
    presetStore,
    storeStore,
    knowledgeChunkStore,
  } = dependencies

  const registry = channelAccountService?.registry
  const accountCount = registry?.size ?? 0

  const app = express()
  const websiteRateLimiter = createWebsiteRateLimiter(
    config.website.rateLimitMax,
    config.website.rateLimitWindowMs,
    cacheService,
  )

  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString()
    },
  }))
  app.use(express.urlencoded({ extended: true }))

  app.use(['/webchat', '/reports', '/admin', '/products', '/knowledge'], (req, res, next) => {
    const handled = applyCorsHeaders(req, res, config.website.allowedOrigins)
    if (handled) return
    next()
  })

  const requireAdmin = createAdminAuthMiddleware(config.adminApiToken)
  app.use(['/admin', '/reports'], requireAdmin)

  const router = express.Router()
  createWebhookRouter(router, {
    registry: registry ?? new ChannelAccountRegistry(),
    x,
    logger,
    runtimeStore,
  })
  app.use(router)

  app.post('/webchat/message', async (req, res) => {
    try {
      const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
      if (config.website.authToken && authHeader !== `Bearer ${config.website.authToken}`) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const rateLimitKey = `${req.ip}:${req.body?.senderId ?? 'anonymous'}`
      if (!(await websiteRateLimiter.allow(rateLimitKey))) {
        res.status(429).json({ error: 'Rate limit exceeded' })
        return
      }

      const payload = website.parseRequest(req.body)
      const response = await website.handleChat(payload)
      await invalidateLeadsCache(cacheService)
      const assetBaseUrl = config.publicBaseUrl ?? `${req.protocol}://${req.get('host')}`
      res.json({
        ...response,
        messages: absolutizeOutgoingMessages(response.messages, assetBaseUrl),
      })
    } catch (error: any) {
      logger.error(`Website chat route error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/', (_req, res) => {
    const accounts = registry?.list() ?? []
    res.json({
      name: 'chatbot-integrations',
      channels: {
        whatsapp: accounts.filter((a) => a.record.channel === 'whatsapp').length,
        instagram: accounts.filter((a) => a.record.channel === 'instagram').length,
        messenger: accounts.filter((a) => a.record.channel === 'messenger').length,
        telegram: accounts.filter((a) => a.record.channel === 'telegram').length,
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
        whatsapp: '/webhooks/whatsapp',
        instagram: '/webhooks/instagram',
        messenger: '/webhooks/messenger',
        telegram: '/webhooks/telegram/:accountId',
        x: x ? '/webhooks/x' : null,
        website: '/webchat/message',
      },
    })
  })

  app.get('/health', async (_req, res) => {
    const nlpHealth = await nlpClient.healthCheck()
    const accounts = registry?.list() ?? []
    let redis: 'ok' | 'disabled' | 'error' = 'disabled'
    if (cacheService.backend === 'redis') {
      try {
        redis = (await cacheService.ping()) ? 'ok' : 'error'
      } catch {
        redis = 'error'
      }
    } else if (isRedisConnected()) {
      redis = 'ok'
    }
    res.json({
      server: 'ok',
      redis,
      cacheBackend: cacheService.backend,
      nlp: nlpHealth,
      channels: {
        whatsapp: accounts.filter((a) => a.record.channel === 'whatsapp').length,
        instagram: accounts.filter((a) => a.record.channel === 'instagram').length,
        messenger: accounts.filter((a) => a.record.channel === 'messenger').length,
        telegram: accounts.filter((a) => a.record.channel === 'telegram').length,
        x: Boolean(x),
        website: true,
      },
      channelAccounts: accountCount,
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
      const cached = await cacheService.getJson<{
        customers: Awaited<ReturnType<typeof orchestrator.listCustomers>>
        identities: ChannelIdentityRecord[]
        summary: Awaited<ReturnType<typeof orchestrator.getSummary>>
        services: { hubspot: boolean }
      }>(CACHE_KEYS.reportsLeads)

      if (cached) {
        res.json(cached)
        return
      }

      const [customers, summary, identities] = await Promise.all([
        orchestrator.listCustomers(),
        orchestrator.getSummary(),
        runtimeStore.listIdentities(),
      ])
      const payload = {
        customers,
        identities,
        summary,
        services: {
          hubspot: Boolean(hubspot),
        },
      }
      await cacheService.setJson(CACHE_KEYS.reportsLeads, payload, config.cache.leadsListTtlSec)
      res.json(payload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/reports/leads/:customerId', async (req, res, next) => {
    try {
      const payload = await loadLeadDetailPayload(runtimeStore, req.params.customerId)
      res.json(payload)
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer not found') {
        res.status(404).json({ error: 'Customer not found' })
        return
      }
      next(error)
    }
  })

  if (productStore) {
    registerProductRoutes({
      app,
      store: productStore,
      logger,
      publicBaseUrl: config.publicBaseUrl,
      cacheService,
    })
    logger.info('Product catalogue routes registered: /admin/products + /products/search')
  } else {
    app.get('/admin/products', (_req, res) => {
      res.status(503).type('html').send('<h1>Product catalogue unavailable</h1><p>Set <code>STORAGE_BACKEND=mysql</code> and restart.</p>')
    })
  }

  if (presetStore) {
    registerPresetRoutes({ app, store: presetStore, logger })
  }

  if (knowledgeChunkStore) {
    registerKnowledgeRoutes({ app, store: knowledgeChunkStore, logger })
    logger.info('Knowledge routes registered: /admin/knowledge + /knowledge/chunks')
  } else {
    app.get('/admin/knowledge', (_req, res) => {
      res.status(503).type('html').send('<h1>Knowledge store unavailable</h1><p>Set <code>STORAGE_BACKEND=mysql</code> and restart.</p>')
    })
  }

  if (storeStore) {
    registerStoreRoutes({ app, store: storeStore, logger })
    logger.info('Store routes registered: /stores + /admin/stores')
  } else {
    app.get('/stores', (_req, res) => {
      res.status(503).type('html').send('<h1>Store service unavailable</h1><p>Set <code>STORAGE_BACKEND=mysql</code> and restart.</p>')
    })
  }

  if (channelAccountService) {
    registerChannelAccountRoutes({ app, service: channelAccountService, logger })
    logger.info('Channel account routes registered: /admin/channel-accounts/api')
  } else {
    app.get('/admin/channel-accounts/api', (_req, res) => {
      res.status(503).json({
        error: 'Channel accounts require STORAGE_BACKEND=mysql and CHANNEL_CREDENTIALS_ENCRYPTION_KEY',
      })
    })
  }

  // ── POST /leads ───────────────────────────────────────────────────────────
  // Called by Rasa's ActionSubmitLeadCapture after the lead capture form
  // completes. Finds the customer by email or phone and updates their
  // qualification status, preferred service, and purchase timeline.
  app.post('/leads', async (req, res, next) => {
    try {
      const body = req.body ?? {}
      const email = typeof body.email === 'string' ? normaliseEmail(body.email.trim()) : undefined
      const phone = typeof body.phone === 'string' ? normalisePhone(body.phone.trim()) : undefined
      const leadName = typeof body.name === 'string' ? body.name.trim() : undefined
      const location = typeof body.location === 'string' ? body.location.trim() : undefined
      const preferredService = typeof body.preferred_service === 'string' ? body.preferred_service.trim() : undefined
      const purchaseTimeline = typeof body.purchase_timeline === 'string' ? body.purchase_timeline.trim() : undefined
      const rawStatus = typeof body.lead_status === 'string' ? body.lead_status.trim() : undefined

      // Find matching customer by email or phone
      const customers = await orchestrator.listCustomers()
      let customer = customers.find((c) => {
        if (email && c.email && normaliseEmail(c.email) === email) return true
        if (phone && c.phone && normalisePhone(c.phone) === phone) return true
        return false
      })

      if (!customer) {
        // No matching customer found — not an error, orchestrator already
        // captures data in-flight. Return 202 so Rasa doesn't retry.
        logger.warn(`[POST /leads] No customer matched for email=${email} phone=${phone} — skipping update`)
        res.status(202).json({ status: 'no_match', message: 'No matching customer record found' })
        return
      }

      const validStatuses = ['qualified', 'unqualified', 'needs_review', 'new'] as const
      type QualStatus = typeof validStatuses[number]
      const qualificationStatus: QualStatus | undefined =
        rawStatus && validStatuses.includes(rawStatus as QualStatus)
          ? (rawStatus as QualStatus)
          : undefined

      const snapshot: Record<string, string | undefined> = {}
      if (leadName && leadName !== customer.leadName) snapshot['leadName'] = leadName
      if (location && location !== customer.location) snapshot['location'] = location
      if (preferredService && preferredService !== customer.preferredService) snapshot['preferredService'] = preferredService
      if (qualificationStatus && qualificationStatus !== customer.qualificationStatus) snapshot['qualificationStatus'] = qualificationStatus

      if (Object.keys(snapshot).length > 0) {
        customer = (await runtimeStore.updateCustomer(customer.id, snapshot)) ?? customer
      }

      // Append purchase_timeline as an urgency interest
      if (purchaseTimeline) {
        await runtimeStore.appendInterest(customer.id, 'urgency', purchaseTimeline)
        await runtimeStore.appendCurrentInterest(customer.id, 'urgency', purchaseTimeline)
      }

      logger.info(`[POST /leads] Updated customer ${customer.id}: status=${qualificationStatus ?? 'unchanged'} service=${preferredService ?? 'unchanged'}`)
      await invalidateLeadsCache(cacheService)
      res.json({ status: 'ok', customerId: customer.id })
    } catch (error) {
      next(error)
    }
  })

  return app
}
