import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { prepareChunks } from './chunker.js'

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.txt'])

export function isAllowedKnowledgeUpload(filename: string): boolean {
  return ALLOWED_EXT.has(path.extname(filename).toLowerCase())
}

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
    throw new Error(`Unsupported file type: ${ext || '(none)'}. Only .pdf, .docx, and .txt are allowed.`)
  }

  if (ext === '.pdf') {
    const data = await pdfParse(buffer)
    return cleanPdfText(data.text ?? '')
  }

  if (ext === '.txt') {
    return buffer.toString('utf-8').trim()
  }

  const result = await mammoth.extractRawText({ buffer })
  return (result.value ?? '').trim()
}

export function chunksFromText(source: string, text: string): Array<{ text: string }> {
  const safeSource = sanitizeSource(source)
  return prepareChunks(safeSource, text).map(({ text: chunkText }) => ({ text: chunkText }))
}

export async function chunksFromFile(
  buffer: Buffer,
  filename: string,
): Promise<Array<{ text: string }>> {
  if (!isAllowedKnowledgeUpload(filename)) {
    throw new Error('Only PDF, DOCX, and TXT files can be uploaded.')
  }
  const source = sanitizeSource(filename)
  const text = await extractTextFromBuffer(buffer, filename)
  return chunksFromText(source, text)
}

export function chunksFromPlainText(source: string, text: string): Array<{ text: string }> {
  return chunksFromText(source, text)
}
