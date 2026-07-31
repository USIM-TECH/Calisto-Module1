import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { parseProductCsv } from './csv-import.js'
import { PrismaStoreStore } from '../storage/prisma-store-store.js'
import type { StoreInput } from '../storage/store-store.interface.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_CSV_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'calisto_nlp_export', 'actions', 'knowledge_base', '__pycache__', 'calisto_stores.csv')
const STATIC_MAP_URL = 'https://maps.google.com/?q=Calisto%20Eyewear'

function blankToNull(value: string | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' || trimmed.toLowerCase() === 'na' ? null : trimmed
}

function toStoreInput(row: Record<string, string>): StoreInput | undefined {
  const name = blankToNull(row.name)
  const city = blankToNull(row.city)
  if (!name || !city) return undefined
  return {
    name,
    address: blankToNull(row.address),
    phone: blankToNull(row.phone),
    state: blankToNull(row.state),
    city,
    imageUrl: blankToNull(row.image_url),
    mapUrl: STATIC_MAP_URL,
  }
}

async function main(): Promise<void> {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV_PATH
  const text = await fs.readFile(csvPath, 'utf8')
  const parsed = parseProductCsv(text)
  const stores = parsed.rows.map(toStoreInput).filter((store): store is StoreInput => Boolean(store))

  const prisma = new PrismaClient()
  try {
    const store = new PrismaStoreStore(prisma)
    const imported = await store.importMany(stores)
    console.log(`Imported ${imported}/${stores.length} stores from ${csvPath}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
