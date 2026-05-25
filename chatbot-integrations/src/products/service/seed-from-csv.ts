import fs from 'fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { importProductsFromCsv } from './csv-import.js'
import { PrismaProductStore } from '../storage/prisma-product-store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

async function main(): Promise<void> {
  const csvPath = process.env.KB_CATALOGUE_PATH
  if (!csvPath) {
    throw new Error(
      'KB_CATALOGUE_PATH is required. Local product CSV files were removed from the repo; use admin CSV import or set this to an external catalogue file.',
    )
  }

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
