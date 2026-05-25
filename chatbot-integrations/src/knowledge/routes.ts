import express, { type Express, type Request } from 'express'
import multer from 'multer'
import type { Logger } from '../core/utils/index.js'
import { renderKnowledgeAdminHtml } from '../frontend/knowledge-dashboard.js'
import {
  chunksFromFile,
  chunksFromPlainText,
  isAllowedKnowledgeUpload,
  sanitizeSource,
} from './service/ingest.js'
import type { KnowledgeChunkStore } from './storage/knowledge-chunk-store.interface.js'
import { chunkHash } from './storage/prisma-knowledge-chunk-store.js'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedKnowledgeUpload(file.originalname)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF, DOCX, and TXT files are allowed'))
    }
  },
})

interface RegisterArgs {
  app: Express
  store: KnowledgeChunkStore
  logger: Logger
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function sourceFromParams(raw: string): string {
  return sanitizeSource(decodeURIComponent(raw))
}

function buildChunkPayload(
  source: string,
  chunks: Array<{ text: string }>,
): Array<{ chunkHash: string; text: string }> {
  return chunks.map((c) => ({
    chunkHash: chunkHash(source, c.text),
    text: c.text,
  }))
}

async function resolveChunksFromRequest(req: Request): Promise<{ source: string; chunks: Array<{ text: string }> }> {
  const file = (req as Request & { file?: Express.Multer.File }).file
  const body = req.body as Record<string, unknown>
  const bodySource = pickString(body.source)
  const bodyText = pickString(body.text)

  if (file) {
    const source = sanitizeSource(bodySource ?? file.originalname)
    const chunks = await chunksFromFile(file.buffer, file.originalname)
    if (chunks.length === 0) {
      throw new Error('No content extracted from file')
    }
    return { source, chunks }
  }

  if (!bodySource || !bodyText) {
    throw new Error('Provide a file upload or JSON body with source and text')
  }

  const source = sanitizeSource(bodySource)
  const chunks = chunksFromPlainText(source, bodyText)
  if (chunks.length === 0) {
    throw new Error('No chunks produced from text')
  }
  return { source, chunks }
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
      const documents = await store.listDocuments()
      res.type('html').send(renderKnowledgeAdminHtml({ documents }))
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

  app.get('/admin/knowledge/api/documents', async (_req, res, next) => {
    try {
      res.json({ documents: await store.listDocuments() })
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/knowledge/api/documents/:source', async (req, res, next) => {
    try {
      const source = sourceFromParams(req.params.source)
      const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50))
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
      const offset = (page - 1) * limit
      const result = await store.listPaged(source, offset, limit)
      const docs = await store.listDocuments()
      const meta = docs.find((d) => d.source === source)
      if (!meta && result.total === 0) {
        res.status(404).json({ error: 'Document not found' })
        return
      }
      res.json({
        source,
        chunkCount: meta?.chunkCount ?? result.total,
        updatedAt: meta?.updatedAt ?? null,
        items: result.items,
        total: result.total,
        page,
        limit,
      })
    } catch (error: any) {
      if (error.message?.includes('Invalid source')) {
        res.status(400).json({ error: error.message })
        return
      }
      next(error)
    }
  })

  app.post(
    '/admin/knowledge/api/documents',
    upload.single('file'),
    async (req, res, next) => {
      try {
        const { source, chunks } = await resolveChunksFromRequest(req)
        if (await store.documentExists(source)) {
          res.status(409).json({ error: `Document already exists: ${source}` })
          return
        }
        const n = await store.replaceDocument(source, buildChunkPayload(source, chunks))
        res.status(201).json({ source, chunkCount: n })
      } catch (error: any) {
        logger.error(`POST /admin/knowledge/api/documents: ${error.message}`)
        res.status(400).json({ error: error.message })
      }
    },
  )

  app.put(
    '/admin/knowledge/api/documents/:source',
    upload.single('file'),
    async (req, res, next) => {
      try {
        const paramSource = sourceFromParams(req.params.source)
        const file = (req as Request & { file?: Express.Multer.File }).file
        const bodyText = pickString((req.body as Record<string, unknown>).text)

        let chunks: Array<{ text: string }>
        if (file) {
          chunks = await chunksFromFile(file.buffer, file.originalname)
        } else if (bodyText) {
          chunks = chunksFromPlainText(paramSource, bodyText)
        } else {
          res.status(400).json({ error: 'Provide a file or text body to replace document' })
          return
        }

        if (chunks.length === 0) {
          res.status(400).json({ error: 'No chunks produced' })
          return
        }

        const n = await store.replaceDocument(paramSource, buildChunkPayload(paramSource, chunks))
        res.json({ source: paramSource, chunkCount: n })
      } catch (error: any) {
        if (error.message?.includes('Invalid source')) {
          res.status(400).json({ error: error.message })
          return
        }
        next(error)
      }
    },
  )

  app.delete('/admin/knowledge/api/documents/:source', async (req, res, next) => {
    try {
      const source = sourceFromParams(req.params.source)
      const ok = await store.deleteDocument(source)
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).end()
    } catch (error: any) {
      if (error.message?.includes('Invalid source')) {
        res.status(400).json({ error: error.message })
        return
      }
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

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)` })
        return
      }
    }
    if (err?.message === 'Only PDF, DOCX, and TXT files are allowed') {
      res.status(400).json({ error: err.message })
      return
    }
    next(err)
  })
}
