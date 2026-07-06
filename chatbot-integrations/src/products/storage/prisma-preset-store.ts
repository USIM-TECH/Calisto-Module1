import { Prisma, PrismaClient } from '@prisma/client'
import { CACHE_KEYS, invalidatePresetCache, type CacheService } from '../../cache/index.js'
import { MemoryCacheService } from '../../cache/memory-cache.js'
import type { PresetStore } from './preset-store.interface.js'
import type {
  ActivePresetPayload,
  PresetInput,
  PresetListResult,
  PresetRecord,
  PresetUpdate,
} from '../preset-types.js'

type PrismaPreset = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

function toRecord(p: PrismaPreset): PresetRecord {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export class PrismaPresetStore implements PresetStore {
  constructor(
    private readonly _client: PrismaClient,
    private readonly _cache: CacheService = new MemoryCacheService({ keyPrefix: 'calisto' }),
    private readonly _activeTtlSec = 120,
  ) {}

  async list(): Promise<PresetListResult> {
    const presets = await this._client.preset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    })
    const items = presets.map((p) => ({
      ...toRecord(p as PrismaPreset),
      productCount: (p as { _count: { products: number } })._count.products,
    }))
    const activePresetId = items.find((p) => p.isActive)?.id ?? null
    return { items, activePresetId }
  }

  async get(id: string): Promise<PresetRecord | undefined> {
    const found = await this._client.preset.findUnique({ where: { id } })
    return found ? toRecord(found as PrismaPreset) : undefined
  }

  async create(input: PresetInput): Promise<PresetRecord> {
    const max = await this._client.preset.aggregate({ _max: { sortOrder: true } })
    const created = await this._client.preset.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    })
    return toRecord(created as PrismaPreset)
  }

  async update(id: string, patch: PresetUpdate): Promise<PresetRecord | undefined> {
    try {
      const updated = await this._client.preset.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        },
      })
      // Keep the cached active-preset payload (which carries the name) in sync
      // when the active preset is renamed.
      if (updated.isActive) {
        await invalidatePresetCache(this._cache)
      }
      return toRecord(updated as PrismaPreset)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined
      }
      throw error
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this._client.preset.delete({ where: { id } })
      await invalidatePresetCache(this._cache)
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false
      }
      throw error
    }
  }

  async setActive(id: string | null): Promise<void> {
    await this._client.$transaction(async (tx) => {
      await tx.preset.updateMany({ where: { isActive: true }, data: { isActive: false } })
      if (id) {
        await tx.preset.update({ where: { id }, data: { isActive: true } })
      }
    })
    await invalidatePresetCache(this._cache)
  }

  async getActive(): Promise<ActivePresetPayload> {
    const cached = await this._cache.getJson<ActivePresetPayload>(CACHE_KEYS.presetActive)
    if (cached) return cached

    const active = await this._client.preset.findFirst({
      where: { isActive: true },
      include: { products: { select: { productId: true } } },
    })

    const payload: ActivePresetPayload = active
      ? {
          presetId: active.id,
          name: active.name,
          productIds: active.products.map((p) => p.productId),
        }
      : { presetId: null, name: null, productIds: [] }

    await this._cache.setJson(CACHE_KEYS.presetActive, payload, this._activeTtlSec)
    return payload
  }

  async getPresetIdsForProduct(productId: string): Promise<string[]> {
    const rows = await this._client.productPreset.findMany({
      where: { productId },
      select: { presetId: true },
    })
    return rows.map((r) => r.presetId)
  }

  async setPresetsForProduct(productId: string, presetIds: string[]): Promise<void> {
    const unique = Array.from(new Set(presetIds))
    await this._client.$transaction([
      this._client.productPreset.deleteMany({ where: { productId } }),
      ...(unique.length > 0
        ? [
            this._client.productPreset.createMany({
              data: unique.map((presetId) => ({ productId, presetId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ])
    await invalidatePresetCache(this._cache)
  }
}
