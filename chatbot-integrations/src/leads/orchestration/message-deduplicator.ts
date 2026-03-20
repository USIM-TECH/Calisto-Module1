import type { IncomingMessage } from '../../core/types.js'
import type { RuntimeStore } from '../storage/runtime-store.interface.js'

export interface MessageDeduplicator {
  shouldProcess(message: IncomingMessage): Promise<boolean>
}

export function createMessageDeduplicator(runtimeStore: RuntimeStore, ttlMs: number = 5 * 60 * 1000): MessageDeduplicator {
  return {
    async shouldProcess(message: IncomingMessage): Promise<boolean> {
      const key = `${message.channel}:${message.messageId}`
      return runtimeStore.shouldProcessDeduplication(key, ttlMs)
    },
  }
}
