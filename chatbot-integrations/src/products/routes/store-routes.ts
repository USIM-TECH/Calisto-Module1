import type { Express, Request } from 'express'
import type { Logger } from '../../core/utils/index.js'
import type { StoreInput, StoreStore, StoreUpdate } from '../storage/store-store.interface.js'

interface RegisterArgs {
  app: Express
  store: StoreStore
  logger: Logger
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function buildCreateInput(req: Request): StoreInput {
  const body = req.body as Record<string, unknown>
  const name = pickString(body.name)
  const city = pickString(body.city)
  if (!name || !city) {
    throw new Error('Missing required fields: name, city')
  }
  return {
    name,
    address: pickString(body.address) ?? null,
    phone: pickString(body.phone) ?? null,
    state: pickString(body.state) ?? null,
    city,
    imageUrl: pickString(body.imageUrl) ?? null,
    fallbackImageUrl: pickString(body.fallbackImageUrl) ?? null,
    mapUrl: pickString(body.mapUrl) ?? null,
  }
}

function buildUpdatePatch(req: Request): StoreUpdate {
  const body = req.body as Record<string, unknown>
  const patch: StoreUpdate = {}
  if (body.name !== undefined) patch.name = pickString(body.name) ?? undefined
  if (body.address !== undefined) patch.address = pickString(body.address) ?? null
  if (body.phone !== undefined) patch.phone = pickString(body.phone) ?? null
  if (body.state !== undefined) patch.state = pickString(body.state) ?? null
  if (body.city !== undefined) patch.city = pickString(body.city) ?? undefined
  if (body.imageUrl !== undefined) patch.imageUrl = pickString(body.imageUrl) ?? null
  if (body.fallbackImageUrl !== undefined) patch.fallbackImageUrl = pickString(body.fallbackImageUrl) ?? null
  if (body.mapUrl !== undefined) patch.mapUrl = pickString(body.mapUrl) ?? null
  return patch
}

export function registerStoreRoutes({ app, store, logger }: RegisterArgs): void {
  app.post('/stores/search', async (req, res) => {
    try {
      const city = pickString(req.body.city) ?? pickString(req.body.location)
      const limit = Math.min(100, Math.max(1, Number(req.body.limit) || 5))
      if (!city) {
        res.status(400).json({ error: 'city or location is required' })
        return
      }
      res.json({ stores: await store.getByCity(city, limit) })
    } catch (error: any) {
      logger.error(`/stores/search error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/stores', async (req, res) => {
    try {
      const result = await store.list({
        city: pickString(req.query.city),
        state: pickString(req.query.state),
        limit: Math.min(100, Math.max(1, Number(req.query.limit) || 50)),
      })
      res.json(result)
    } catch (error: any) {
      logger.error(`/stores error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/stores/cities', async (_req, res) => {
    try {
      res.json({ cities: await store.distinctCities() })
    } catch (error: any) {
      logger.error(`/stores/cities error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/stores/states', async (_req, res) => {
    try {
      res.json({ states: await store.distinctStates() })
    } catch (error: any) {
      logger.error(`/stores/states error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.post('/admin/stores', async (req, res) => {
    try {
      res.status(201).json(await store.create(buildCreateInput(req)))
    } catch (error: any) {
      logger.error(`/admin/stores POST error: ${error.message}`)
      res.status(error?.message?.startsWith('Missing required fields') ? 400 : 500).json({ error: error.message })
    }
  })

  app.post('/admin/stores/import', async (req, res) => {
    try {
      const stores = (req.body as { stores?: StoreInput[] }).stores ?? []
      if (!Array.isArray(stores) || stores.length === 0) {
        res.status(400).json({ error: 'stores array is required' })
        return
      }
      res.json({ imported: await store.importMany(stores), total: stores.length })
    } catch (error: any) {
      logger.error(`/admin/stores/import error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/admin/stores/:id', async (req, res) => {
    try {
      const found = await store.get(req.params.id)
      if (!found) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(found)
    } catch (error: any) {
      logger.error(`/admin/stores/:id error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.put('/admin/stores/:id', async (req, res) => {
    try {
      const updated = await store.update(req.params.id, buildUpdatePatch(req))
      if (!updated) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(updated)
    } catch (error: any) {
      logger.error(`/admin/stores/:id PUT error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.delete('/admin/stores/:id', async (req, res) => {
    try {
      const ok = await store.delete(req.params.id)
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).end()
    } catch (error: any) {
      logger.error(`/admin/stores/:id DELETE error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })
}
