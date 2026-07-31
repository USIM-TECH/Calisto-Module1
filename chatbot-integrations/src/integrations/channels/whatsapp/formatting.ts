import { marked, type Token as MarkedToken } from 'marked'


const FIXED_SIZE_SPACE_CHAR = '\u2002'
const ALT_BULLET_SYMBOLS = ['•', '◦', '➤', '✦']

export function convertMarkdownToWhatsApp(markdown: string): string {
  const tokens = marked.lexer(markdown)
  return processTokens(tokens, {}).trimEnd()
}

interface Context {
  currentListDepth?: number
  currentQuoteDepth?: number
  inHeader?: boolean
}

function processTokens(tokens: MarkedToken[], ctx: Context): string {
  return tokens.map((token) => processToken(token, ctx)).join('')
}

function processToken(token: MarkedToken, ctx: Context): string {
  switch (token.type) {
    case 'paragraph':
      return processInlineTokens(token.tokens ?? [], ctx) + '\n'

    case 'heading':
      const headingText = processInlineTokens(token.tokens ?? [], { ...ctx, inHeader: true })
      return `*${headingText}*\n\n`

    case 'list':
      return processListToken(token, { ...ctx, currentListDepth: ctx.currentListDepth ?? 0 }) + '\n'

    case 'list_item':
      return processTokens(token.tokens ?? [], ctx)

    case 'code':
      return `\`\`\`${token.text}\`\`\`\n`

    case 'hr':
      return '───────────\n'

    case 'blockquote':
      return processBlockQuote(token, { ...ctx, currentQuoteDepth: ctx.currentQuoteDepth ?? 0 }) + '\n'

    case 'space':
      return '\n'

    case 'text':
      if ('tokens' in token && token.tokens) {
        return processInlineTokens(token.tokens, ctx)
      }
      return token.raw

    default:
      return token.raw ?? ''
  }
}

function processInlineTokens(tokens: MarkedToken[], ctx: Context): string {
  return tokens.map((token) => processInlineToken(token, ctx)).join('')
}

function processInlineToken(token: MarkedToken, ctx: Context): string {
  switch (token.type) {
    case 'strong':
      return `*${processInlineTokens(token.tokens ?? [], ctx)}*`
    case 'em':
      return `_${processInlineTokens(token.tokens ?? [], ctx)}_`
    case 'del':
      return `~${processInlineTokens(token.tokens ?? [], ctx)}~`
    case 'codespan':
      return `\`${token.text}\``
    case 'link':
      const linkText = processInlineTokens(token.tokens ?? [], ctx)
      return linkText === token.href ? token.href : `${linkText} (${token.href})`
    case 'image':
      return token.href ?? ''
    case 'br':
      return '\n'
    case 'text':
      return token.text
    case 'escape':
      return token.text
    default:
      return token.raw ?? ''
  }
}

function processListToken(token: any, ctx: Context): string {
  const depth = ctx.currentListDepth ?? 0
  const items = token.items ?? []
  return items
    .map((item: any, index: number) => {
      const indent = FIXED_SIZE_SPACE_CHAR.repeat(depth * 3)
      const bullet = token.ordered
        ? `${index + 1}.`
        : ALT_BULLET_SYMBOLS[Math.min(depth, ALT_BULLET_SYMBOLS.length - 1)]
      const content = processTokens(item.tokens ?? [], { ...ctx, currentListDepth: depth + 1 }).trimEnd()
      return `${indent}${bullet} ${content}`
    })
    .join('\n')
}

function processBlockQuote(token: any, ctx: Context): string {
  const depth = ctx.currentQuoteDepth ?? 0
  const prefix = '> '.repeat(depth + 1)
  const content = processTokens(token.tokens ?? [], { ...ctx, currentQuoteDepth: depth + 1 })
  return content
    .split('\n')
    .map((line: string) => `${prefix}${line}`)
    .join('\n')
}

export function splitTextMessageIfNeeded(message: string): string[] {
  const MAX_LENGTH = 4096
  if (message.length <= MAX_LENGTH) return [message]

  const numChunks = Math.ceil(message.length / MAX_LENGTH)
  return Array.from({ length: numChunks }, (_, i) => {
    const start = i * MAX_LENGTH
    return message.slice(start, start + MAX_LENGTH)
  })
}
