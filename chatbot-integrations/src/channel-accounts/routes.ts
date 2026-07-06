import type { Express } from 'express'
import { z } from 'zod'
import type { Logger } from '../core/utils/index.js'
import type { ChannelAccountService } from './channel-account-service.js'
import type {
  ChannelAccountInput,
  ChannelAccountUpdateInput,
  InstagramCredentials,
  ManagedChannel,
  MessengerCredentials,
  TelegramCredentials,
  WhatsAppCredentials,
} from './credential-types.js'

const managedChannelSchema = z.enum(['whatsapp', 'instagram', 'messenger', 'telegram'])

const createBodySchema = z.object({
  label: z.string().min(1),
  channel: managedChannelSchema,
  nativeId: z.string().optional(),
  verifyToken: z.string().optional(),
  metaAppId: z.string().optional(),
  apiVersion: z.string().optional(),
  credentials: z.record(z.unknown()),
})

function parseCredentials(channel: ManagedChannel, raw: Record<string, unknown>): ChannelAccountInput['credentials'] {
  switch (channel) {
    case 'whatsapp':
      return {
        accessToken: String(raw.accessToken ?? ''),
        phoneNumberId: String(raw.phoneNumberId ?? ''),
        clientSecret: raw.clientSecret ? String(raw.clientSecret) : undefined,
        clientId: raw.clientId ? String(raw.clientId) : undefined,
        wabaId: raw.wabaId ? String(raw.wabaId) : undefined,
      } satisfies WhatsAppCredentials
    case 'instagram':
      return {
        accessToken: String(raw.accessToken ?? ''),
        instagramId: String(raw.instagramId ?? ''),
        clientId: String(raw.clientId ?? ''),
        clientSecret: raw.clientSecret ? String(raw.clientSecret) : undefined,
      } satisfies InstagramCredentials
    case 'messenger':
      return {
        pageAccessToken: String(raw.pageAccessToken ?? ''),
        pageId: String(raw.pageId ?? ''),
        clientId: String(raw.clientId ?? ''),
        clientSecret: raw.clientSecret ? String(raw.clientSecret) : undefined,
        appToken: raw.appToken ? String(raw.appToken) : undefined,
      } satisfies MessengerCredentials
    case 'telegram':
      return {
        botToken: String(raw.botToken ?? ''),
        secretToken: raw.secretToken ? String(raw.secretToken) : undefined,
        apiBaseUrl: raw.apiBaseUrl ? String(raw.apiBaseUrl) : undefined,
      } satisfies TelegramCredentials
    default:
      throw new Error(`Unsupported channel: ${channel satisfies never}`)
  }
}

interface RegisterArgs {
  app: Express
  service: ChannelAccountService
  logger: Logger
}

export function registerChannelAccountRoutes({ app, service, logger }: RegisterArgs): void {
  app.get('/admin/channel-accounts/api', async (_req, res, next) => {
    try {
      res.json({ items: await service.list() })
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/channel-accounts/api/:id', async (req, res, next) => {
    try {
      const account = await service.get(req.params.id)
      if (!account) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(account)
    } catch (error) {
      next(error)
    }
  })

  app.post('/admin/channel-accounts/api', async (req, res, next) => {
    try {
      const parsed = createBodySchema.parse(req.body ?? {})
      const input: ChannelAccountInput = {
        label: parsed.label,
        channel: parsed.channel,
        nativeId: parsed.nativeId,
        verifyToken: parsed.verifyToken,
        metaAppId: parsed.metaAppId,
        apiVersion: parsed.apiVersion,
        credentials: parseCredentials(parsed.channel, parsed.credentials),
      }
      const created = await service.create(input)
      res.status(201).json(created)
    } catch (error: any) {
      logger.error(`POST /admin/channel-accounts/api: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.put('/admin/channel-accounts/api/:id', async (req, res, next) => {
    try {
      const parsed = createBodySchema.partial().extend({ enabled: z.boolean().optional() }).parse(req.body ?? {})
      const existing = await service.get(req.params.id)
      if (!existing) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      const channel = parsed.channel ?? existing.channel
      const credentials = parsed.credentials
        ? Object.fromEntries(
            Object.entries(parsed.credentials).filter(([, value]) => value !== undefined && value !== ''),
          )
        : undefined
      const updated = await service.update(req.params.id, {
        label: parsed.label,
        nativeId: parsed.nativeId,
        verifyToken: parsed.verifyToken,
        metaAppId: parsed.metaAppId,
        apiVersion: parsed.apiVersion,
        enabled: parsed.enabled,
        credentials: credentials as ChannelAccountUpdateInput['credentials'],
      })
      res.json(updated)
    } catch (error: any) {
      logger.error(`PUT /admin/channel-accounts/api/:id: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.delete('/admin/channel-accounts/api/:id', async (req, res, next) => {
    try {
      const disabled = await service.disable(req.params.id)
      if (!disabled) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.post('/admin/channel-accounts/api/:id/validate', async (req, res, next) => {
    try {
      const existing = await service.get(req.params.id)
      if (!existing) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      const parsed = createBodySchema.pick({ channel: true, credentials: true }).partial().parse(req.body ?? {})
      const channel = parsed.channel ?? existing.channel
      const credentials = parsed.credentials
        ? parseCredentials(channel, parsed.credentials)
        : undefined
      if (!credentials) {
        res.status(400).json({ error: 'credentials are required' })
        return
      }
      await service.validateAccount(req.params.id, channel, credentials)
      res.json({ ok: true })
    } catch (error: any) {
      res.status(400).json({ error: error.message })
    }
  })

  app.post('/admin/channel-accounts/api/:id/register-webhook', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { publicBaseUrl?: string }
      const account = await service.registerWebhook(req.params.id, body.publicBaseUrl)
      res.json(account)
    } catch (error: any) {
      logger.error(`POST register-webhook: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })
}
