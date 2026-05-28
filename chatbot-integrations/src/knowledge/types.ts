export interface KnowledgeChunkRecord {
  id: string
  chunkHash: string
  source: string
  text: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChunkWire {
  source: string
  text: string
}

export interface KnowledgeDocumentSummary {
  source: string
  chunkCount: number
  updatedAt: string
}

export interface KnowledgeDocumentDetail extends KnowledgeDocumentSummary {
  chunks: KnowledgeChunkRecord[]
  total: number
  page: number
  limit: number
}
