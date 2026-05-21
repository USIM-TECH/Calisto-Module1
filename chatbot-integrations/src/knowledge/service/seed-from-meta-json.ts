import fs from 'fs/promises'
import path from 'path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { chunkHash, PrismaKnowledgeChunkStore } from '../storage/prisma-knowledge-chunk-store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

const DEFAULT_META = path.resolve(
  __dirname,
  '..', '..', '..', '..',
  'calisto_nlp_export', 'knowledge_base', 'index', 'calisto_meta.json',
)

async function main(): Promise<void> {
  const metaPath = process.env.KB_INDEX_META_PATH ?? DEFAULT_META
  const raw = await fs.readFile(metaPath, 'utf-8')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${metaPath}`)
  }

  const items: Array<{ chunkHash: string; source: string; text: string }> = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const rec = entry as Record<string, unknown>
    const source = typeof rec.source === 'string' ? rec.source : ''
    const text = typeof rec.text === 'string' ? rec.text : ''
    if (!source || !text) continue
    items.push({ chunkHash: chunkHash(source, text), source, text })
  }

  const prisma = new PrismaClient()
  const store = new PrismaKnowledgeChunkStore(prisma)
  const n = await store.upsertMany(items)
  const docCount = (await store.listDocuments()).length
  console.log(`[seed:knowledge] meta=${metaPath} chunks=${n} documents=${docCount}`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[seed:knowledge] failed:', err)
  process.exit(1)
})
