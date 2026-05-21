import type {
  KnowledgeChunkRecord,
  KnowledgeChunkWire,
  KnowledgeDocumentSummary,
} from '../types.js'

export interface KnowledgeChunkStore {
  upsertMany(items: Array<{ chunkHash: string; source: string; text: string }>): Promise<number>
  listForRasa(): Promise<KnowledgeChunkWire[]>
  countBySource(): Promise<Array<{ source: string; count: number }>>
  listPaged(source: string | undefined, offset: number, limit: number): Promise<{ items: KnowledgeChunkRecord[]; total: number }>
  deleteById(id: string): Promise<boolean>
  listDocuments(): Promise<KnowledgeDocumentSummary[]>
  getChunksBySource(source: string): Promise<KnowledgeChunkRecord[]>
  replaceDocument(source: string, chunks: Array<{ chunkHash: string; text: string }>): Promise<number>
  deleteDocument(source: string): Promise<boolean>
  documentExists(source: string): Promise<boolean>
}
