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
