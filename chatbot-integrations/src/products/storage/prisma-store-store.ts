import { Prisma, type PrismaClient } from '@prisma/client'
import type { StoreInput, StoreListQuery, StoreListResult, StoreRecord, StoreStore, StoreUpdate } from './store-store.interface.js'

function toRecord(s: any): StoreRecord {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    phone: s.phone,
    state: s.state,
    city: s.city,
    imageUrl: s.imageUrl,
    fallbackImageUrl: s.fallbackImageUrl,
    mapUrl: s.mapUrl,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}

export class PrismaStoreStore implements StoreStore {
  constructor(private readonly _client: PrismaClient) {}

  public async list(query: StoreListQuery = {}): Promise<StoreListResult> {
    const limit = Math.min(100, Math.max(1, query.limit ?? 50))
    const where: Prisma.StoreWhereInput = {}
    if (query.city) where.city = { contains: query.city }
    if (query.state) where.state = { equals: query.state }

    const [items, total] = await Promise.all([
      this._client.store.findMany({
        where,
        take: limit,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
      }),
      this._client.store.count({ where }),
    ])

    return { items: items.map(toRecord), total }
  }

  public async get(id: string): Promise<StoreRecord | undefined> {
    const found = await this._client.store.findUnique({ where: { id } })
    return found ? toRecord(found) : undefined
  }

  public async getByCity(city: string, limit = 5): Promise<StoreRecord[]> {
    const stores = await this._client.store.findMany({
      where: { city: { contains: city } },
      take: Math.min(100, Math.max(1, limit)),
      orderBy: { name: 'asc' },
    })
    return stores.map(toRecord)
  }

  public async exists(id: string): Promise<boolean> {
    return (await this._client.store.count({ where: { id } })) > 0
  }

  public async create(input: StoreInput): Promise<StoreRecord> {
    const created = await this._client.store.create({ data: this.toCreateData(input) })
    return toRecord(created)
  }

  public async update(id: string, patch: StoreUpdate): Promise<StoreRecord | undefined> {
    try {
      const updated = await this._client.store.update({ where: { id }, data: patch })
      return toRecord(updated)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return undefined
      throw error
    }
  }

  public async delete(id: string): Promise<boolean> {
    try {
      await this._client.store.delete({ where: { id } })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return false
      throw error
    }
  }

  public async importMany(inputs: StoreInput[]): Promise<number> {
    let imported = 0
    for (const input of inputs) {
      const existing = await this._client.store.findFirst({
        where: {
          name: input.name,
          city: input.city,
          address: input.address ?? '',
        },
      })
      if (existing) {
        await this._client.store.update({
          where: { id: existing.id },
          data: {
            phone: input.phone ?? null,
            state: input.state ?? null,
            imageUrl: input.imageUrl ?? null,
            fallbackImageUrl: input.fallbackImageUrl ?? null,
            mapUrl: input.mapUrl ?? null,
          },
        })
      } else {
        await this._client.store.create({ data: this.toCreateData(input) })
      }
      imported++
    }
    return imported
  }

  public async distinctCities(): Promise<string[]> {
    const rows = await this._client.store.findMany({
      distinct: ['city'],
      select: { city: true },
      orderBy: { city: 'asc' },
    })
    return rows.map((r) => r.city).filter(Boolean)
  }

  public async distinctStates(): Promise<string[]> {
    const rows = await this._client.store.findMany({
      distinct: ['state'],
      select: { state: true },
      orderBy: { state: 'asc' },
    })
    return rows.map((r) => r.state).filter((s): s is string => Boolean(s))
  }

  private toCreateData(input: StoreInput): Prisma.StoreCreateInput {
    return {
      name: input.name,
      address: input.address ?? '',
      phone: input.phone ?? null,
      state: input.state ?? null,
      city: input.city,
      imageUrl: input.imageUrl ?? null,
      fallbackImageUrl: input.fallbackImageUrl ?? null,
      mapUrl: input.mapUrl ?? null,
    }
  }
}
