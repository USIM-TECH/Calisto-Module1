import type { Express } from 'express'
import { z } from 'zod'
import type { Logger } from '../core/utils/index.js'
import type { WebchatSettingsStore } from './webchat-settings-store.js'

const updateBodySchema = z.object({ responseMode: z.enum(['payload', 'chat']) })

interface RegisterArgs {
  app: Express
  store: WebchatSettingsStore
  logger: Logger
}

export function registerWebchatSettingsRoutes({ app, store, logger }: RegisterArgs): void {
  app.get('/admin/webchat/settings', async (_req, res, next) => {
    try {
      res.json({ responseMode: await store.getResponseMode() })
    } catch (error) {
      next(error)
    }
  })

  app.put('/admin/webchat/settings', async (req, res) => {
    try {
      const { responseMode } = updateBodySchema.parse(req.body ?? {})
      res.json({ responseMode: await store.setResponseMode(responseMode) })
    } catch (error: any) {
      logger.error(`PUT /admin/webchat/settings: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })
}
