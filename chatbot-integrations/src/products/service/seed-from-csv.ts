import fs from 'fs/promises'
import path from 'path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { PrismaProductStore } from '../storage/prisma-product-store.js'
import type { ProductInput } from '../types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  '..', '..', '..', '..',
  'calisto_nlp_export', 'knowledge_base', 'calisto_product_catalog_500.csv',
)

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = []
  const lines = text.split(/\r?\n/)
  if (lines.length === 0) return rows

  const header = splitCsvLine(lines[0])
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) continue
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    for (let c = 0; c < header.length; c += 1) {
      row[header[c]] = cells[c] ?? ''
    }
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let buf = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buf += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

function blankToNull(value: string | undefined): string | null {
  if (value === undefined || value === null) return null
  const t = value.trim()
  return t === '' ? null : t
}

function toBool(value: string | undefined): boolean {
  if (!value) return false
  const t = value.trim().toLowerCase()
  return t === 'yes' || t === 'true' || t === '1' || t === 'y'
}

function toFloat(value: string | undefined): number {
  const n = Number.parseFloat((value ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

function toFloatOrNull(value: string | undefined): number | null {
  const t = (value ?? '').trim()
  if (t === '') return null
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function rowToInput(row: Record<string, string>): ProductInput | undefined {
  const productId = blankToNull(row.product_id)
  const productName = blankToNull(row.product_name)
  const category = blankToNull(row.category)
  const productType = blankToNull(row.product_type)
  const brand = blankToNull(row.brand)
  if (!productId || !productName || !category || !productType || !brand) return undefined

  return {
    productId,
    productName,
    category,
    productType,
    brand,
    priceMyr: toFloat(row.price_myr),
    description: blankToNull(row.description),
    frameMaterial: blankToNull(row.frame_material),
    frameShape: blankToNull(row.frame_shape),
    frameColor: blankToNull(row.frame_color),
    gender: blankToNull(row.gender),
    uvProtection: blankToNull(row.uv_protection),
    polarized: blankToNull(row.polarized),
    lensColor: blankToNull(row.lens_color),
    frameStyle: blankToNull(row.frame_style),
    lensType: blankToNull(row.lens_type),
    lensFeature: blankToNull(row.lens_feature),
    lensDuration: blankToNull(row.lens_duration),
    multifocal: blankToNull(row.multifocal),
    storeLocation: blankToNull(row.store_location),
    city: blankToNull(row.city),
    stockStatus: blankToNull(row.stock_status) ?? 'in_stock',
    rating: toFloatOrNull(row.rating),
    bestseller: toBool(row.bestseller),
    newArrival: toBool(row.new_arrival),
    imageUrl: null,
  }
}

async function main(): Promise<void> {
  const csvPath = process.env.KB_CATALOGUE_PATH ?? DEFAULT_CSV_PATH
  const text = await fs.readFile(csvPath, 'utf-8')
  const rows = parseCsv(text)

  const prisma = new PrismaClient()
  const store = new PrismaProductStore(prisma)

  let inserted = 0
  let skipped = 0
  let invalid = 0

  for (const row of rows) {
    const input = rowToInput(row)
    if (!input) {
      invalid += 1
      continue
    }
    if (await store.exists(input.productId)) {
      skipped += 1
      continue
    }
    await store.create(input)
    inserted += 1
  }

  console.log(`[seed] csv=${csvPath}`)
  console.log(`[seed] inserted=${inserted} skipped=${skipped} invalid=${invalid} total=${rows.length}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
