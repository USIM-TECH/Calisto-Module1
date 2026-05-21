import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { prepareChunks } from './chunker.js'

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.csv', '.txt'])

export function sanitizeSource(source: string): string {
  const base = path.basename(source.trim())
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid source filename')
  }
  return base
}

function cleanPdfText(text: string): string {
  const lines = text.split('\n')
  const cleaned: string[] = []
  for (const line of lines) {
    const stripped = line.trim()
    if (/^[\d\s\-–,]+$/.test(stripped)) continue
    if (/^\d+$/.test(stripped)) continue
    if (stripped) cleaned.push(stripped)
  }
  return cleaned.join('\n')
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = path.extname(filename).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported file type: ${ext || '(none)'}. Use .pdf, .docx, .csv, or .txt`)
  }

  if (ext === '.pdf') {
    const data = await pdfParse(buffer)
    return cleanPdfText(data.text ?? '')
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer })
    return (result.value ?? '').trim()
  }

  if (ext === '.txt') {
    return buffer.toString('utf-8').trim()
  }

  // CSV: one logical row per line in output (joined for prepareChunks on non-CSV path)
  if (ext === '.csv') {
    const rows = parseCsvRows(buffer)
    return rows.join('\n\n')
  }

  throw new Error(`Unsupported file type: ${ext}`)
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

export function parseCsvRows(buffer: Buffer): string[] {
  const lines = buffer
    .toString('utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0])
  const chunks: string[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i])
    const parts = headers
      .map((h, j) => (values[j] ? `${h}: ${values[j]}` : ''))
      .filter(Boolean)
    if (parts.length > 0) chunks.push(parts.join(' | '))
  }
  return chunks
}

/**
 * CSV files: one chunk per row (matches Python loader). Other types use paragraph chunking.
 */
export function chunksFromText(source: string, text: string, fromCsv = false): Array<{ text: string }> {
  const safeSource = sanitizeSource(source)

  if (fromCsv) {
    const lines = text.split('\n\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1 || (lines.length === 1 && lines[0].includes(' | '))) {
      return lines.map((line) => ({ text: line }))
    }
  }

  return prepareChunks(safeSource, text).map(({ text: chunkText }) => ({ text: chunkText }))
}

export async function chunksFromFile(
  buffer: Buffer,
  filename: string,
): Promise<Array<{ text: string }>> {
  const source = sanitizeSource(filename)
  const ext = path.extname(filename).toLowerCase()

  if (ext === '.csv') {
    const rows = parseCsvRows(buffer)
    return rows.map((text) => ({ text }))
  }

  const text = await extractTextFromBuffer(buffer, filename)
  return chunksFromText(source, text)
}

export function chunksFromPlainText(source: string, text: string): Array<{ text: string }> {
  return chunksFromText(source, text)
}
