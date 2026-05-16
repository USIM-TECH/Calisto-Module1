import type { Express } from 'express'
import type { Logger } from '../core/utils/index.js'
import { renderKnowledgeAdminHtml } from '../frontend/knowledge-dashboard.js'
import type { KnowledgeChunkStore } from './storage/knowledge-chunk-store.interface.js'

interface RegisterArgs {
  app: Express
  store: KnowledgeChunkStore
  logger: Logger
}

export function registerKnowledgeRoutes({ app, store, logger }: RegisterArgs): void {
  app.get('/knowledge/chunks', async (_req, res, next) => {
    try {
      const chunks = await store.listForRasa()
      res.json(chunks)
    } catch (error: any) {
      logger.error(`/knowledge/chunks error: ${error.message}`)
      next(error)
    }
  })

  app.get('/admin/knowledge', async (_req, res, next) => {
    try {
      const summary = await store.countBySource()
      res.type('html').send(renderKnowledgeAdminHtml({ summary }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/knowledge/api/summary', async (_req, res, next) => {
    try {
      res.json({ sources: await store.countBySource() })
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/knowledge/api', async (req, res, next) => {
    try {
      const source = typeof req.query.source === 'string' ? req.query.source : undefined
      const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50))
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
      const offset = (page - 1) * limit
      const result = await store.listPaged(source, offset, limit)
      res.json({ ...result, page, limit })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/admin/knowledge/api/:id', async (req, res, next) => {
    try {
      const ok = await store.deleteById(req.params.id)
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })
}
