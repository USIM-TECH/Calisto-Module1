/**
 * Port of calisto_nlp_export/actions/knowledge_base/chunker.py prepare_chunks logic.
 */

function splitParagraphs(text: string): string[] {
  const blocks = text.split(/\n\s*\n|(?=\n\d+\.\s)/)
  return blocks.map((b) => b.trim()).filter(Boolean)
}

function mergeSmallBlocks(blocks: string[], minWords = 15, maxWords = 100): string[] {
  const merged: string[] = []
  let buf = ''

  for (const block of blocks) {
    const candidate = buf ? `${buf} ${block}`.trim() : block
    if (candidate.split(/\s+/).length <= maxWords) {
      buf = candidate
    } else {
      if (buf) merged.push(buf)
      let words = block.split(/\s+/)
      while (words.length > 0) {
        merged.push(words.slice(0, maxWords).join(' '))
        words = words.slice(maxWords)
      }
      buf = ''
    }
  }

  if (buf) {
    const wordCount = buf.split(/\s+/).length
    if (wordCount >= minWords) {
      merged.push(buf)
    } else if (merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${buf}`
    } else {
      merged.push(buf)
    }
  }

  return merged
}

export function prepareChunks(
  source: string,
  text: string,
  chunkSize = 100,
): Array<{ source: string; text: string }> {
  const trimmed = text.trim()
  if (!trimmed) return []

  const wordCount = trimmed.split(/\s+/).length
  if (wordCount <= chunkSize) {
    return [{ source, text: trimmed }]
  }

  const paragraphs = splitParagraphs(trimmed)
  const blocks = mergeSmallBlocks(paragraphs, 15, chunkSize)
  return blocks.map((block) => ({ source, text: block }))
}
