import { Prisma, PrismaClient } from '@prisma/client'
import { CACHE_KEYS, invalidateProductCache, type CacheService } from '../../cache/index.js'
import { MemoryCacheService } from '../../cache/memory-cache.js'
import type { ProductStore } from './product-store.interface.js'
import type {
  ProductInput,
  ProductListQuery,
  ProductListResult,
  ProductRecord,
  ProductUpdate,
} from '../types.js'

type PrismaProduct = {
  productId: string
  productName: string
  category: string
  productType: string
  brand: string
  priceMyr: number
  description: string | null
  frameMaterial: string | null
  frameShape: string | null
  frameColor: string | null
  gender: string | null
  uvProtection: string | null
  polarized: string | null
  lensColor: string | null
  frameStyle: string | null
  lensType: string | null
  lensFeature: string | null
  lensDuration: string | null
  multifocal: string | null
  storeLocation: string | null
  city: string | null
  stockStatus: string
  rating: number | null
  bestseller: boolean
  newArrival: boolean
  imageUrl: string | null
  fallbackImageUrl: string | null
  createdAt: Date
  updatedAt: Date
}

function toRecord(p: PrismaProduct): ProductRecord {
  return {
    productId: p.productId,
    productName: p.productName,
    category: p.category,
    productType: p.productType,
    brand: p.brand,
    priceMyr: p.priceMyr,
    description: p.description,
    frameMaterial: p.frameMaterial,
    frameShape: p.frameShape,
    frameColor: p.frameColor,
    gender: p.gender,
    uvProtection: p.uvProtection,
    polarized: p.polarized,
    lensColor: p.lensColor,
    frameStyle: p.frameStyle,
    lensType: p.lensType,
    lensFeature: p.lensFeature,
    lensDuration: p.lensDuration,
    multifocal: p.multifocal,
    storeLocation: p.storeLocation,
    city: p.city,
    stockStatus: p.stockStatus,
    rating: p.rating,
    bestseller: p.bestseller,
    newArrival: p.newArrival,
    imageUrl: p.imageUrl,
    fallbackImageUrl: p.fallbackImageUrl,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export class PrismaProductStore implements ProductStore {
  constructor(
    private readonly _client: PrismaClient,
    private readonly _cache: CacheService = new MemoryCacheService({ keyPrefix: 'calisto' }),
    private readonly _catalogueTtlSec = 300,
  ) {}

  async list(query: ProductListQuery = {}): Promise<ProductListResult> {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.min(500, Math.max(1, query.limit ?? 50))

    const where: Prisma.ProductWhereInput = {}
    if (query.productType) {
      where.productType = { contains: query.productType, mode: 'insensitive' }
    }
    if (query.brand) {
      where.brand = { equals: query.brand, mode: 'insensitive' }
    }
    if (query.q) {
      const term = query.q.trim()
      if (term.length > 0) {
        where.OR = [
          { productId: { contains: term, mode: 'insensitive' } },
          { productName: { contains: term, mode: 'insensitive' } },
          { brand: { contains: term, mode: 'insensitive' } },
          { productType: { contains: term, mode: 'insensitive' } },
          { category: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ]
      }
    }

    const [items, total] = await Promise.all([
      this._client.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this._client.product.count({ where }),
    ])

    return {
      items: items.map((item) => toRecord(item as PrismaProduct)),
      total,
      page,
      limit,
    }
  }

  async listAll(): Promise<ProductRecord[]> {
    const cached = await this._cache.getJson<ProductRecord[]>(CACHE_KEYS.productsCatalogue)
    if (cached) return cached

    const items = await this._client.product.findMany({
      orderBy: [{ productType: 'asc' }, { brand: 'asc' }, { priceMyr: 'asc' }],
    })
    const records = items.map((item) => toRecord(item as PrismaProduct))
    await this._cache.setJson(CACHE_KEYS.productsCatalogue, records, this._catalogueTtlSec)
    return records
  }

  async get(productId: string): Promise<ProductRecord | undefined> {
    const found = await this._client.product.findUnique({ where: { productId } })
    return found ? toRecord(found as PrismaProduct) : undefined
  }

  async exists(productId: string): Promise<boolean> {
    const count = await this._client.product.count({ where: { productId } })
    return count > 0
  }

  async create(input: ProductInput): Promise<ProductRecord> {
    const created = await this._client.product.create({
      data: {
        productId: input.productId,
        productName: input.productName,
        category: input.category,
        productType: input.productType,
        brand: input.brand,
        priceMyr: input.priceMyr,
        description: input.description ?? null,
        frameMaterial: input.frameMaterial ?? null,
        frameShape: input.frameShape ?? null,
        frameColor: input.frameColor ?? null,
        gender: input.gender ?? null,
        uvProtection: input.uvProtection ?? null,
        polarized: input.polarized ?? null,
        lensColor: input.lensColor ?? null,
        frameStyle: input.frameStyle ?? null,
        lensType: input.lensType ?? null,
        lensFeature: input.lensFeature ?? null,
        lensDuration: input.lensDuration ?? null,
        multifocal: input.multifocal ?? null,
        storeLocation: input.storeLocation ?? null,
        city: input.city ?? null,
        stockStatus: input.stockStatus,
        rating: input.rating ?? null,
        bestseller: input.bestseller,
        newArrival: input.newArrival,
        imageUrl: input.imageUrl ?? null,
        fallbackImageUrl: input.fallbackImageUrl ?? null,
      },
    })
    await invalidateProductCache(this._cache)
    return toRecord(created as PrismaProduct)
  }

  async update(productId: string, patch: ProductUpdate): Promise<ProductRecord | undefined> {
    try {
      const updated = await this._client.product.update({
        where: { productId },
        data: patch as Prisma.ProductUpdateInput,
      })
      await invalidateProductCache(this._cache)
      return toRecord(updated as PrismaProduct)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined
      }
      throw error
    }
  }

  async delete(productId: string): Promise<boolean> {
    try {
      await this._client.product.delete({ where: { productId } })
      await invalidateProductCache(this._cache)
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false
      }
      throw error
    }
  }
  async nextId(): Promise<string> {
    const all = await this._client.product.findMany({ select: { productId: true } })
    let max = 0
    for (const { productId } of all) {
      const match = /^P(\d+)$/.exec(productId)
      if (match) {
        const n = Number.parseInt(match[1], 10)
        if (Number.isFinite(n) && n > max) max = n
      }
    }
    return `P${String(max + 1).padStart(4, '0')}`
  }

  async distinctProductTypes(): Promise<string[]> {
    const rows = await this._client.product.findMany({
      distinct: ['productType'],
      select: { productType: true },
      orderBy: { productType: 'asc' },
    })
    return rows.map((r) => r.productType).filter(Boolean)
  }

  async distinctBrands(): Promise<string[]> {
    const rows = await this._client.product.findMany({
      distinct: ['brand'],
      select: { brand: true },
      orderBy: { brand: 'asc' },
    })
    return rows.map((r) => r.brand).filter(Boolean)
  }
}
