import type { Express } from 'express'
import type { Logger } from '../../core/utils/index.js'
import type { PresetStore } from '../storage/preset-store.interface.js'

interface RegisterPresetArgs {
  app: Express
  store: PresetStore
  logger: Logger
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
}

export function registerPresetRoutes({ app, store, logger }: RegisterPresetArgs): void {
  // Public endpoint consumed by Rasa to apply the active merchandising preset.
  app.get('/products/active-preset', async (_req, res, next) => {
    try {
      res.json(await store.getActive())
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/presets/api', async (_req, res, next) => {
    try {
      res.json(await store.list())
    } catch (error) {
      next(error)
    }
  })

  app.post('/admin/presets/api', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      const name = pickString(body.name)
      if (!name) {
        res.status(400).json({ error: 'Preset name is required' })
        return
      }
      const created = await store.create({ name, description: pickString(body.description) ?? null })
      res.status(201).json(created)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        res.status(409).json({ error: 'A preset with that name already exists' })
        return
      }
      next(error)
    }
  })

  // Activate exactly one preset, or pass null/empty to restore default behaviour.
  app.post('/admin/presets/api/active', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      const presetId = pickString(body.presetId) ?? null
      if (presetId) {
        const exists = await store.get(presetId)
        if (!exists) {
          res.status(404).json({ error: 'Preset not found' })
          return
        }
      }
      await store.setActive(presetId)
      res.json(await store.list())
    } catch (error) {
      next(error)
    }
  })

  // Product-membership routes must be registered before the `/:id` routes so
  // that the literal "product" segment is not captured as a preset id.
  app.get('/admin/presets/api/product/:productId', async (req, res, next) => {
    try {
      res.json({ presetIds: await store.getPresetIdsForProduct(req.params.productId) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/admin/presets/api/product/:productId', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      const presetIds = pickStringArray(body.presetIds)
      await store.setPresetsForProduct(req.params.productId, presetIds)
      res.json({ presetIds })
    } catch (error) {
      next(error)
    }
  })

  app.put('/admin/presets/api/:id', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>
      const patch: { name?: string; description?: string | null } = {}
      if (typeof body.name === 'string') patch.name = body.name.trim()
      if (body.description !== undefined) patch.description = pickString(body.description) ?? null
      const updated = await store.update(req.params.id, patch)
      if (!updated) {
        res.status(404).json({ error: 'Preset not found' })
        return
      }
      res.json(updated)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        res.status(409).json({ error: 'A preset with that name already exists' })
        return
      }
      next(error)
    }
  })

  app.delete('/admin/presets/api/:id', async (req, res, next) => {
    try {
      const ok = await store.delete(req.params.id)
      if (!ok) {
        res.status(404).json({ error: 'Preset not found' })
        return
      }
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  logger.info('Preset routes registered: /admin/presets + /products/active-preset')
}
