import assert from 'node:assert/strict'
import test from 'node:test'
import { createMessageDeduplicator } from './message-deduplicator.js'

test('duplicate inbound message IDs are processed only once per channel', async () => {
  const seen = new Set<string>()
  const deduplicator = createMessageDeduplicator({
    shouldProcessDeduplication: async (key: string) => {
      if (seen.has(key)) return false
      seen.add(key)
      return true
    },
  } as any)
  const message = { channel: 'telegram', messageId: 'update-1', senderId: 'user-1' } as any
  assert.equal(await deduplicator.shouldProcess(message), true)
  assert.equal(await deduplicator.shouldProcess(message), false)
  assert.equal(await deduplicator.shouldProcess({ ...message, channel: 'whatsapp' }), true)
})
