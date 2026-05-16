import { Prisma, PrismaClient } from '@prisma/client'
import type { KnowledgeChunkStore } from './knowledge-chunk-store.interface.js'
import type { KnowledgeChunkRecord, KnowledgeChunkWire } from '../types.js'

type Row = {
  id: string
  chunkHash: string
  source: string
  text: string
  createdAt: Date
  updatedAt: Date
}

function toRecord(r: Row): KnowledgeChunkRecord {
  return {
    id: r.id,
    chunkHash: r.chunkHash,
    source: r.source,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export class PrismaKnowledgeChunkStore implements KnowledgeChunkStore {
  constructor(private readonly _client: PrismaClient) {}

  async upsertMany(items: Array<{ chunkHash: string; source: string; text: string }>): Promise<number> {
    let n = 0
    for (const item of items) {
      await this._client.knowledgeChunk.upsert({
        where: { chunkHash: item.chunkHash },
        create: {
          chunkHash: item.chunkHash,
          source: item.source,
          text: item.text,
        },
        update: {
          source: item.source,
          text: item.text,
        },
      })
      n += 1
    }
    return n
  }

  async listForRasa(): Promise<KnowledgeChunkWire[]> {
    const rows = await this._client.knowledgeChunk.findMany({
      select: { source: true, text: true },
      orderBy: [{ source: 'asc' }, { id: 'asc' }],
    })
    return rows.map((r) => ({ source: r.source, text: r.text }))
  }

  async countBySource(): Promise<Array<{ source: string; count: number }>> {
    const grouped = await this._client.knowledgeChunk.groupBy({
      by: ['source'],
      _count: { _all: true },
      orderBy: { source: 'asc' },
    })
    return grouped.map((g) => ({ source: g.source, count: g._count._all }))
  }

  async listPaged(
    source: string | undefined,
    offset: number,
    limit: number,
  ): Promise<{ items: KnowledgeChunkRecord[]; total: number }> {
    const where: Prisma.KnowledgeChunkWhereInput = source ? { source } : {}
    const [items, total] = await Promise.all([
      this._client.knowledgeChunk.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: [{ source: 'asc' }, { id: 'asc' }],
      }),
      this._client.knowledgeChunk.count({ where }),
    ])
    return { items: items.map((r) => toRecord(r as Row)), total }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      await this._client.knowledgeChunk.delete({ where: { id } })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false
      }
      throw error
    }
  }
}
