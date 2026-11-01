/** Redacts secrets and common PII before diagnostic text reaches logs. */
export function sanitizeLogText(value: unknown, maxLength = 240): string {
  let text = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value) } catch { return String(value) }
  })()
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[^\s,"'}]+/gi, '$1=[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[PHONE]')
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
