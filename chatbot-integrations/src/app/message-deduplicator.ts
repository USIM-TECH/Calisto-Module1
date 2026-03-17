import type { IncomingMessage } from '../core/types.js'
import type { RuntimeStore } from './runtime-store.js'

export interface MessageDeduplicator {
  shouldProcess(message: IncomingMessage): boolean
}

export function createMessageDeduplicator(runtimeStore: RuntimeStore, ttlMs: number = 5 * 60 * 1000): MessageDeduplicator {
  return {
    shouldProcess(message: IncomingMessage): boolean {
      const key = `${message.channel}:${message.messageId}`
      return runtimeStore.shouldProcessDeduplication(key, ttlMs)
    },
  }
}
