import crypto from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import type { KnowledgeChunkStore } from './knowledge-chunk-store.interface.js'
import type { KnowledgeChunkRecord, KnowledgeChunkWire, KnowledgeDocumentSummary } from '../types.js'

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

export function chunkHash(source: string, text: string): string {
  return crypto.createHash('sha256').update(`${source}\0${text}`, 'utf8').digest('hex')
}

export class PrismaKnowledgeChunkStore implements KnowledgeChunkStore {
  constructor(private readonly _client: PrismaClient) {}

  async documentExists(source: string): Promise<boolean> {
    const doc = await this._client.knowledgeDocument.findUnique({
      where: { source },
      select: { id: true },
    })
    return doc !== null
  }

  async listDocuments(): Promise<KnowledgeDocumentSummary[]> {
    const docs = await this._client.knowledgeDocument.findMany({
      orderBy: { source: 'asc' },
      include: { _count: { select: { chunks: true } } },
    })
    return docs.map((d) => ({
      source: d.source,
      chunkCount: d._count.chunks,
      updatedAt: d.updatedAt.toISOString(),
    }))
  }

  async getChunksBySource(source: string): Promise<KnowledgeChunkRecord[]> {
    const rows = await this._client.knowledgeChunk.findMany({
      where: { source },
      orderBy: { id: 'asc' },
    })
    return rows.map((r) => toRecord(r as Row))
  }

  async replaceDocument(
    source: string,
    chunks: Array<{ chunkHash: string; text: string }>,
  ): Promise<number> {
    return this._client.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.upsert({
        where: { source },
        create: { source },
        update: {},
      })

      await tx.knowledgeChunk.deleteMany({ where: { documentId: doc.id } })

      if (chunks.length === 0) {
        return 0
      }

      await tx.knowledgeChunk.createMany({
        data: chunks.map((c) => ({
          documentId: doc.id,
          chunkHash: c.chunkHash,
          source,
          text: c.text,
        })),
        skipDuplicates: false,
      })

      await tx.knowledgeDocument.update({
        where: { id: doc.id },
        data: { updatedAt: new Date() },
      })

      return chunks.length
    })
  }

  async deleteDocument(source: string): Promise<boolean> {
    try {
      await this._client.knowledgeDocument.delete({ where: { source } })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false
      }
      throw error
    }
  }

  async upsertMany(items: Array<{ chunkHash: string; source: string; text: string }>): Promise<number> {
    const bySource = new Map<string, Array<{ chunkHash: string; text: string }>>()
    for (const item of items) {
      const list = bySource.get(item.source) ?? []
      list.push({ chunkHash: item.chunkHash, text: item.text })
      bySource.set(item.source, list)
    }

    let total = 0
    for (const [source, chunks] of bySource) {
      total += await this.replaceDocument(source, chunks)
    }
    return total
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
