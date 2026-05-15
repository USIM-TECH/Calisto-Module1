import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import express, { type Express, type Request } from 'express'
import multer from 'multer'
import type { Logger } from '../core/utils/index.js'
import { renderProductsAdminHtml } from '../frontend/products-dashboard.js'
import { ProductSearchService } from './service/product-search.js'
import type { ProductStore } from './storage/product-store.interface.js'
import {
  toWirePayload,
  type ProductInput,
  type ProductSearchQuery,
  type ProductUpdate,
} from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'public', 'products')
const STATIC_PREFIX = '/static'
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

interface RegisterArgs {
  app: Express
  store: ProductStore
  logger: Logger
  publicBaseUrl?: string
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true })
      cb(null, UPLOAD_DIR)
    } catch (error: any) {
      cb(error, UPLOAD_DIR)
    }
  },
  filename: (_req, file, cb) => {
    const ext = extensionFor(file.mimetype)
    const id = crypto.randomUUID()
    cb(null, `${id}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported image type: ${file.mimetype}`))
    }
  },
})

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function pickFloat(value: unknown): number | undefined {
  const s = pickString(value)
  if (s === undefined) return undefined
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

function pickBool(value: unknown): boolean | undefined {
  const s = pickString(value)
  if (s === undefined) return undefined
  const t = s.toLowerCase()
  if (['true', 'yes', '1', 'on'].includes(t)) return true
  if (['false', 'no', '0', 'off'].includes(t)) return false
  return undefined
}

function uploadedImageUrl(req: Request): string | undefined {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!file) return undefined
  return `${STATIC_PREFIX}/products/${file.filename}`
}

async function buildCreateInput(req: Request, store: ProductStore): Promise<ProductInput> {
  const body = req.body as Record<string, unknown>
  const productId = pickString(body.productId) ?? (await store.nextId())
  const productName = pickString(body.productName)
  const category = pickString(body.category)
  const productType = pickString(body.productType)
  const brand = pickString(body.brand)
  const price = pickFloat(body.priceMyr)

  if (!productName || !category || !productType || !brand || price === undefined) {
    throw new Error('Missing required fields: productName, category, productType, brand, priceMyr')
  }

  return {
    productId,
    productName,
    category,
    productType,
    brand,
    priceMyr: price,
    description: pickString(body.description) ?? null,
    frameMaterial: pickString(body.frameMaterial) ?? null,
    frameShape: pickString(body.frameShape) ?? null,
    frameColor: pickString(body.frameColor) ?? null,
    gender: pickString(body.gender) ?? null,
    uvProtection: pickString(body.uvProtection) ?? null,
    polarized: pickString(body.polarized) ?? null,
    lensColor: pickString(body.lensColor) ?? null,
    frameStyle: pickString(body.frameStyle) ?? null,
    lensType: pickString(body.lensType) ?? null,
    lensFeature: pickString(body.lensFeature) ?? null,
    lensDuration: pickString(body.lensDuration) ?? null,
    multifocal: pickString(body.multifocal) ?? null,
    storeLocation: pickString(body.storeLocation) ?? null,
    city: pickString(body.city) ?? null,
    stockStatus: pickString(body.stockStatus) ?? 'in_stock',
    rating: pickFloat(body.rating) ?? null,
    bestseller: pickBool(body.bestseller) ?? false,
    newArrival: pickBool(body.newArrival) ?? false,
    imageUrl: uploadedImageUrl(req) ?? pickString(body.imageUrl) ?? null,
  }
}

function buildUpdatePatch(req: Request): ProductUpdate {
  const body = req.body as Record<string, unknown>
  const patch: ProductUpdate = {}

  const assign = <K extends keyof ProductUpdate>(key: K, value: ProductUpdate[K] | undefined) => {
    if (value !== undefined) patch[key] = value
  }

  assign('productName', pickString(body.productName))
  assign('category', pickString(body.category))
  assign('productType', pickString(body.productType))
  assign('brand', pickString(body.brand))
  assign('priceMyr', pickFloat(body.priceMyr))
  assign('description', pickString(body.description) ?? null)
  assign('frameMaterial', pickString(body.frameMaterial) ?? null)
  assign('frameShape', pickString(body.frameShape) ?? null)
  assign('frameColor', pickString(body.frameColor) ?? null)
  assign('gender', pickString(body.gender) ?? null)
  assign('uvProtection', pickString(body.uvProtection) ?? null)
  assign('polarized', pickString(body.polarized) ?? null)
  assign('lensColor', pickString(body.lensColor) ?? null)
  assign('frameStyle', pickString(body.frameStyle) ?? null)
  assign('lensType', pickString(body.lensType) ?? null)
  assign('lensFeature', pickString(body.lensFeature) ?? null)
  assign('lensDuration', pickString(body.lensDuration) ?? null)
  assign('multifocal', pickString(body.multifocal) ?? null)
  assign('storeLocation', pickString(body.storeLocation) ?? null)
  assign('city', pickString(body.city) ?? null)
  assign('stockStatus', pickString(body.stockStatus))
  assign('rating', pickFloat(body.rating) ?? null)
  assign('bestseller', pickBool(body.bestseller))
  assign('newArrival', pickBool(body.newArrival))

  const uploadedImage = uploadedImageUrl(req)
  if (uploadedImage) {
    patch.imageUrl = uploadedImage
  } else if (typeof body.imageUrl === 'string') {
    patch.imageUrl = pickString(body.imageUrl) ?? null
  }

  return patch
}

function parseSearchBody(body: unknown): ProductSearchQuery {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  const limit = (() => {
    const raw = data.limit
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.min(20, Math.floor(raw)))
    if (typeof raw === 'string') {
      const n = Number.parseInt(raw, 10)
      if (Number.isFinite(n)) return Math.max(1, Math.min(20, n))
    }
    return undefined
  })()

  return {
    productType: pickString(data.product_type) ?? pickString(data.productType),
    brand: pickString(data.brand),
    priceRange: pickString(data.price_range) ?? pickString(data.priceRange),
    frameColor: pickString(data.frame_color) ?? pickString(data.frameColor),
    frameShape: pickString(data.frame_shape) ?? pickString(data.frameShape),
    frameMaterial: pickString(data.frame_material) ?? pickString(data.frameMaterial),
    useCase: pickString(data.use_case) ?? pickString(data.useCase),
    budgetMin: pickFloat(data.budget_min) ?? pickFloat(data.budgetMin),
    budgetMax: pickFloat(data.budget_max) ?? pickFloat(data.budgetMax),
    budgetBucket: pickString(data.budget_bucket) ?? pickString(data.budgetBucket),
    limit,
  }
}

export function registerProductRoutes({ app, store, logger, publicBaseUrl }: RegisterArgs): void {
  const search = new ProductSearchService(store)

  app.use(STATIC_PREFIX, express.static(path.resolve(__dirname, '..', '..', 'public'), {
    fallthrough: true,
    maxAge: '1h',
  }))

  app.post('/products/search', async (req, res) => {
    try {
      const query = parseSearchBody(req.body)
      const results = await search.search(query)
      res.json(results.map((p) => toWirePayload(p, publicBaseUrl)))
    } catch (error: any) {
      logger.error(`/products/search error: ${error.message}`)
      res.status(400).json({ error: error.message })
    }
  })

  app.get('/admin/products', async (_req, res, next) => {
    try {
      const [items, productTypes, brands] = await Promise.all([
        store.listAll(),
        store.distinctProductTypes(),
        store.distinctBrands(),
      ])
      res.type('html').send(renderProductsAdminHtml({ items, productTypes, brands }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/products/api', async (req, res, next) => {
    try {
      const result = await store.list({
        q: pickString(req.query.q),
        productType: pickString(req.query.product_type) ?? pickString(req.query.productType),
        brand: pickString(req.query.brand),
        page: pickFloat(req.query.page),
        limit: pickFloat(req.query.limit),
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  app.get('/admin/products/api/:productId', async (req, res, next) => {
    try {
      const found = await store.get(req.params.productId)
      if (!found) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(found)
    } catch (error) {
      next(error)
    }
  })

  app.post('/admin/products/api', upload.single('image'), async (req, res, next) => {
    try {
      const input = await buildCreateInput(req, store)
      if (await store.exists(input.productId)) {
        res.status(409).json({ error: `Product ${input.productId} already exists` })
        return
      }
      const created = await store.create(input)
      res.status(201).json(created)
    } catch (error: any) {
      if (error?.message?.startsWith('Missing required fields')) {
        res.status(400).json({ error: error.message })
        return
      }
      if (error?.message?.startsWith('Unsupported image type')) {
        res.status(400).json({ error: error.message })
        return
      }
      next(error)
    }
  })

  app.put('/admin/products/api/:productId', upload.single('image'), async (req, res, next) => {
    try {
      const patch = buildUpdatePatch(req)
      const updated = await store.update(req.params.productId, patch)
      if (!updated) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(updated)
    } catch (error) {
      next(error)
    }
  })

  app.delete('/admin/products/api/:productId', async (req, res, next) => {
    try {
      const ok = await store.delete(req.params.productId)
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
