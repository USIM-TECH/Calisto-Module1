import assert from 'node:assert/strict'
import test from 'node:test'
import { LlmProviderManager } from './provider-manager.js'

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} } as any
}

function ollamaConfig() {
  return { ollamaUrl: 'http://127.0.0.1:11434', model: 'llama3', timeoutMs: 1000, temperature: 0 }
}

test('runtime provider resolves the current active configuration without restart', async () => {
  let active: any = { id: 'gemini-1', provider: 'gemini', model: 'gemini-test', apiKey: 'test-key' }
  const store = { getActive: async () => active } as any
  const manager = new LlmProviderManager(store, ollamaConfig(), logger())
  assert.equal((await manager.resolve()).name, 'gemini')
  active = { id: 'groq-1', provider: 'groq', model: 'groq-test', apiKey: 'test-key' }
  assert.equal((await manager.resolve()).name, 'groq')
})

test('an active hosted provider without credentials is rejected before a request', async () => {
  const store = { getActive: async () => ({ id: 'missing-key', provider: 'openai', model: 'gpt-test' }) } as any
  const manager = new LlmProviderManager(store, ollamaConfig(), logger())
  await assert.rejects(() => manager.resolve(), /not configured/)
})

