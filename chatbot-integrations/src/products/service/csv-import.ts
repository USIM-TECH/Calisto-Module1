import type { ProductInput } from '../types.js'
import type { ProductStore } from '../storage/product-store.interface.js'

export type ProductImportMode = 'skip' | 'update'

export const PRODUCT_CSV_REQUIRED_COLUMNS = [
  'product_id',
  'product_name',
  'category',
  'product_type',
  'brand',
  'price_myr',
] as const

export const PRODUCT_CSV_COLUMNS = [
  ...PRODUCT_CSV_REQUIRED_COLUMNS,
  'description',
  'frame_material',
  'frame_shape',
  'frame_color',
  'gender',
  'uv_protection',
  'polarized',
  'lens_color',
  'frame_style',
  'lens_type',
  'lens_feature',
  'lens_duration',
  'multifocal',
  'store_location',
  'city',
  'stock_status',
  'rating',
  'bestseller',
  'new_arrival',
  'image_url',
] as const

const VALID_STOCK_STATUSES = new Set(['in_stock', 'low_stock', 'out_of_stock'])

export type ProductCsvImportErrorCode =
  | 'EMPTY_FILE'
  | 'NO_HEADER'
  | 'NO_DATA_ROWS'
  | 'MISSING_COLUMNS'
  | 'INVALID_FILE'

export interface ProductImportInvalidRow {
  line: number
  productId?: string
  reason: string
  missingFields?: string[]
}

export interface ProductImportResult {
  ok: boolean
  total: number
  inserted: number
  updated: number
  skipped: number
  invalid: number
  invalidRows: ProductImportInvalidRow[]
  warnings: string[]
}

export class ProductCsvImportError extends Error {
  readonly code: ProductCsvImportErrorCode
  readonly details: Record<string, unknown>

  constructor(
    message: string,
    code: ProductCsvImportErrorCode,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ProductCsvImportError'
    this.code = code
    this.details = details
  }
}

export function isProductCsvImportError(error: unknown): error is ProductCsvImportError {
  return error instanceof ProductCsvImportError
}

interface ParsedCsv {
  headers: string[]
  rows: Array<Record<string, string>>
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

function parseBoolField(value: string | undefined, field: string): { ok: true; value: boolean } | { ok: false; reason: string } {
  if (!value || value.trim() === '') return { ok: true, value: false }
  const t = value.trim().toLowerCase()
  if (['yes', 'true', '1', 'y'].includes(t)) return { ok: true, value: true }
  if (['no', 'false', '0', 'n'].includes(t)) return { ok: true, value: false }
  return { ok: false, reason: `${field} must be yes/no (got "${value.trim()}")` }
}

function parsePrice(value: string | undefined): { ok: true; value: number } | { ok: false; reason: string } {
  const raw = (value ?? '').trim()
  if (raw === '') {
    return { ok: false, reason: 'price_myr is required' }
  }
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) {
    return { ok: false, reason: `price_myr must be a number (got "${raw}")` }
  }
  if (n < 0) {
    return { ok: false, reason: 'price_myr cannot be negative' }
  }
  return { ok: true, value: n }
}

function parseRating(value: string | undefined): { ok: true; value: number | null } | { ok: false; reason: string } {
  const raw = (value ?? '').trim()
  if (raw === '') return { ok: true, value: null }
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) {
    return { ok: false, reason: `rating must be a number (got "${raw}")` }
  }
  if (n < 0 || n > 5) {
    return { ok: false, reason: 'rating must be between 0 and 5' }
  }
  return { ok: true, value: n }
}

function parseStockStatus(value: string | undefined): { ok: true; value: string } | { ok: false; reason: string } {
  const raw = (value ?? '').trim()
  if (raw === '') return { ok: true, value: 'in_stock' }
  const normalized = raw.toLowerCase().replace(/\s+/g, '_')
  if (!VALID_STOCK_STATUSES.has(normalized)) {
    return {
      ok: false,
      reason: `stock_status must be in_stock, low_stock, or out_of_stock (got "${raw}")`,
    }
  }
  return { ok: true, value: normalized }
}

export function parseProductCsv(text: string): ParsedCsv {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new ProductCsvImportError('CSV file is empty.', 'EMPTY_FILE')
  }

  const lines = trimmed.split(/\r?\n/)
  const headerLine = lines[0]?.trim()
  if (!headerLine) {
    throw new ProductCsvImportError('CSV file has no header row.', 'NO_HEADER')
  }

  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (headers.length === 0) {
    throw new ProductCsvImportError('CSV header row is empty.', 'NO_HEADER')
  }

  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) continue
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = (cells[c] ?? '').trim()
    }
    rows.push(row)
  }

  return { headers, rows }
}

export function validateCsvHeaders(headers: string[]): void {
  const headerSet = new Set(headers)
  const missingColumns = PRODUCT_CSV_REQUIRED_COLUMNS.filter((col) => !headerSet.has(col))

  if (missingColumns.length > 0) {
    throw new ProductCsvImportError(
      `CSV is missing required column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}.`,
      'MISSING_COLUMNS',
      {
        missingColumns,
        foundColumns: headers,
        requiredColumns: [...PRODUCT_CSV_REQUIRED_COLUMNS],
      },
    )
  }
}

type RowValidation =
  | { ok: true; input: ProductInput }
  | { ok: false; invalid: ProductImportInvalidRow }

export function validateCsvRow(row: Record<string, string>, line: number): RowValidation {
  const missingFields: string[] = []
  for (const field of PRODUCT_CSV_REQUIRED_COLUMNS) {
    if (field === 'price_myr') continue
    if (!blankToNull(row[field])) missingFields.push(field)
  }

  const productId = blankToNull(row.product_id)
  const price = parsePrice(row.price_myr)
  if (!price.ok) {
    if (price.reason === 'price_myr is required') missingFields.push('price_myr')
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      invalid: {
        line,
        productId: productId ?? undefined,
        reason: `Missing required value${missingFields.length === 1 ? '' : 's'}: ${missingFields.join(', ')}`,
        missingFields,
      },
    }
  }

  if (!price.ok) {
    return {
      ok: false,
      invalid: {
        line,
        productId: productId ?? undefined,
        reason: price.reason,
      },
    }
  }

  const rating = parseRating(row.rating)
  if (!rating.ok) {
    return { ok: false, invalid: { line, productId: productId!, reason: rating.reason } }
  }

  const stockStatus = parseStockStatus(row.stock_status)
  if (!stockStatus.ok) {
    return { ok: false, invalid: { line, productId: productId!, reason: stockStatus.reason } }
  }

  const bestseller = parseBoolField(row.bestseller, 'bestseller')
  if (!bestseller.ok) {
    return { ok: false, invalid: { line, productId: productId!, reason: bestseller.reason } }
  }

  const newArrival = parseBoolField(row.new_arrival, 'new_arrival')
  if (!newArrival.ok) {
    return { ok: false, invalid: { line, productId: productId!, reason: newArrival.reason } }
  }

  return {
    ok: true,
    input: {
      productId: productId!,
      productName: blankToNull(row.product_name)!,
      category: blankToNull(row.category)!,
      productType: blankToNull(row.product_type)!,
      brand: blankToNull(row.brand)!,
      priceMyr: price.value,
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
      stockStatus: stockStatus.value,
      rating: rating.value,
      bestseller: bestseller.value,
      newArrival: newArrival.value,
      imageUrl: blankToNull(row.image_url),
    },
  }
}

function inputToUpdate(input: ProductInput): Omit<ProductInput, 'productId'> {
  const { productId: _id, ...rest } = input
  return rest
}

export async function importProductsFromCsv(
  store: ProductStore,
  csvText: string,
  mode: ProductImportMode = 'skip',
): Promise<ProductImportResult> {
  const { headers, rows } = parseProductCsv(csvText)
  validateCsvHeaders(headers)

  if (rows.length === 0) {
    throw new ProductCsvImportError(
      'CSV has a header row but no product rows.',
      'NO_DATA_ROWS',
      { foundColumns: headers },
    )
  }

  const result: ProductImportResult = {
    ok: true,
    total: rows.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
    invalidRows: [],
    warnings: [],
  }

  const seenIds = new Map<string, number>()

  for (let i = 0; i < rows.length; i += 1) {
    const line = i + 2
    const validated = validateCsvRow(rows[i], line)
    if (!validated.ok) {
      result.invalid += 1
      result.invalidRows.push(validated.invalid)
      continue
    }

    const input = validated.input
    const firstLine = seenIds.get(input.productId)
    if (firstLine !== undefined) {
      result.invalid += 1
      result.invalidRows.push({
        line,
        productId: input.productId,
        reason: `Duplicate product_id "${input.productId}" (first seen on line ${firstLine})`,
      })
      continue
    }
    seenIds.set(input.productId, line)

    const exists = await store.exists(input.productId)
    if (exists) {
      if (mode === 'update') {
        const updated = await store.update(input.productId, inputToUpdate(input))
        if (updated) {
          result.updated += 1
        } else {
          result.skipped += 1
          result.warnings.push(`Line ${line}: product ${input.productId} could not be updated`)
        }
      } else {
        result.skipped += 1
      }
      continue
    }

    await store.create(input)
    result.inserted += 1
  }

  result.ok = result.invalid === 0
  if (result.invalid > 0) {
    result.warnings.unshift(
      `${result.invalid} row${result.invalid === 1 ? '' : 's'} could not be imported. See details below.`,
    )
  }
  if (result.inserted === 0 && result.updated === 0 && result.invalid === 0 && result.skipped > 0) {
    result.warnings.push('No new products were added — every row matched an existing product_id (skip mode).')
  }

  return result
}

export function productCsvTemplate(): string {
  const header = PRODUCT_CSV_COLUMNS.join(',')
  const sample = [
    'P9999',
    'Sample Frame',
    'Frames',
    'Designer Frames',
    'Calisto',
    '299.00',
    'Sample product description',
    'acetate',
    'round',
    'black',
    'unisex',
    'yes',
    'no',
    '',
    'round',
    '',
    '',
    '',
    '',
    'Calisto HQ',
    'Kuala Lumpur',
    'in_stock',
    '4.5',
    'no',
    'yes',
    '',
  ].join(',')
  return `${header}\n${sample}\n`
}

export function formatImportErrorResponse(error: ProductCsvImportError): Record<string, unknown> {
  return {
    error: error.message,
    code: error.code,
    ...error.details,
  }
}
