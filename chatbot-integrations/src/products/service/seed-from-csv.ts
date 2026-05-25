import fs from 'fs/promises'
import path from 'path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { importProductsFromCsv } from './csv-import.js'
import { PrismaProductStore } from '../storage/prisma-product-store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  '..', '..', '..', '..',
  'calisto_nlp_export', 'knowledge_base', 'calisto_product_catalog_500.csv',
)

async function main(): Promise<void> {
  const csvPath = process.env.KB_CATALOGUE_PATH ?? DEFAULT_CSV_PATH
  const text = await fs.readFile(csvPath, 'utf-8')

  const prisma = new PrismaClient()
  const store = new PrismaProductStore(prisma)
  const result = await importProductsFromCsv(store, text, 'skip')

  console.log(`[seed] csv=${csvPath}`)
  console.log(
    `[seed] inserted=${result.inserted} skipped=${result.skipped} invalid=${result.invalid} total=${result.total}`,
  )

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
