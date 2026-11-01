import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'
import { ReliableLlmProvider, classifyLlmError, isTransientLlmError } from './llm-reliability.js'

const base = { name: 'mock', healthCheck: async () => true } as any

test('retries transient failures within a bounded attempt budget', async () => {
  let calls = 0
  const provider = new ReliableLlmProvider({ ...base, generate: async () => { calls += 1; if (calls === 1) throw new Error('temporary') ; return 'ok' } }, { maxAttempts: 2, sleep: async () => {} })
  await assert.rejects(() => provider.generate([]), /temporary/)
  assert.equal(calls, 1)
  const retryable = new ReliableLlmProvider({ ...base, generate: async () => { calls += 1; const error = new Error('timeout') as any; error.code = 'ETIMEDOUT'; throw error } }, { maxAttempts: 2, sleep: async () => {} })
  await assert.rejects(() => retryable.generate([]))
  assert.equal(calls, 3)
})

test('classifies provider failures and opens circuit after repeated failures', async () => {
  const error = { isAxiosError: true, response: { status: 429, headers: {} } } as any
  assert.equal(classifyLlmError(error), 'rate_limited')
  assert.equal(isTransientLlmError('timeout'), true)
  let calls = 0
  const provider = new ReliableLlmProvider({ ...base, generate: async () => { calls += 1; const down = axios.AxiosError.from(new Error('down'), 'ECONNREFUSED'); throw down } }, { failureThreshold: 2, cooldownMs: 60_000 })
  await assert.rejects(() => provider.generate([]))
  await assert.rejects(() => provider.generate([]))
  await assert.rejects(() => provider.generate([]), /circuit is open/)
  assert.equal(calls, 2)
})

test('fallback is opt-in and makes one compatible call without looping', async () => {
  let fallbackCalls = 0
  const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
  const fallback = { ...base, generate: async () => { fallbackCalls += 1; return '{"ok":true}' } }
  const disabled = new ReliableLlmProvider({ ...base, generate: async () => { throw timeout } }, { fallback, maxAttempts: 1 })
  await assert.rejects(() => disabled.generate([]))
  assert.equal(fallbackCalls, 0)
  const enabled = new ReliableLlmProvider({ ...base, generate: async () => { throw timeout } }, { fallback, fallbackEnabled: true, maxAttempts: 1 })
  assert.equal(await enabled.generate([]), '{"ok":true}')
  assert.equal(fallbackCalls, 1)
})
