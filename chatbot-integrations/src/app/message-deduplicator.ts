import type { IncomingMessage } from '../core/types.js'

export interface MessageDeduplicator {
  shouldProcess(message: IncomingMessage): boolean
}

export function createMessageDeduplicator(ttlMs: number = 5 * 60 * 1000): MessageDeduplicator {
  const seen = new Map<string, number>()

  function cleanup(now: number) {
    for (const [key, timestamp] of seen.entries()) {
      if (now - timestamp > ttlMs) {
        seen.delete(key)
      }
    }
  }

  return {
    shouldProcess(message: IncomingMessage): boolean {
      const now = Date.now()
      cleanup(now)

      const key = `${message.channel}:${message.messageId}`
      if (seen.has(key)) {
        return false
      }

      seen.set(key, now)
      return true
    },
  }
}
