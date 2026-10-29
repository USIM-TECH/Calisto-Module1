import assert from 'node:assert/strict'
import test from 'node:test'
import { ProviderConfigStore } from './provider-config-store.js'

const key = 'a'.repeat(64)

function prisma() {
  const rows = new Map<string, any>()
  return {
    llmProviderConfig: {
      findMany: async () => [...rows.values()],
      findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
      findFirst: async ({ where }: any) => [...rows.values()].find((row) => row.active === where.active && row.enabled === where.enabled) ?? null,
      create: async ({ data }: any) => { const row = { id: data.id ?? `cfg-${rows.size + 1}`, ...data, createdAt: new Date(), updatedAt: new Date(), lastTestAt: null, lastTestStatus: null }; rows.set(row.id, row); return row },
      update: async ({ where, data }: any) => { const row = { ...rows.get(where.id), ...data, updatedAt: new Date() }; rows.set(row.id, row); return row },
      updateMany: async ({ data }: any) => { for (const row of rows.values()) Object.assign(row, data) },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    rows,
  } as any
}

test('provider keys are encrypted and never returned by configuration wire records', async () => {
  const database = prisma()
  const store = new ProviderConfigStore(database, key)
  const wire = await store.upsert({ name: 'OpenAI test', provider: 'openai', model: 'gpt-test', apiKey: 'super-secret' })
  assert.equal(wire.configured, true)
  assert.equal((wire as any).apiKey, undefined)
  assert.notEqual(database.rows.get(wire.id).apiKeyEncrypted, 'super-secret')
  await store.markTest(wire.id, true)
  await store.activate(wire.id)
  assert.equal((await store.getActive())?.apiKey, 'super-secret')
})

test('hosted providers cannot activate without a saved key', async () => {
  const store = new ProviderConfigStore(prisma(), key)
  const wire = await store.upsert({ name: 'Gemini test', provider: 'gemini', model: 'gemini-test' })
  await assert.rejects(() => store.activate(wire.id), /validated/i)
})

test('multiple configurations can use the same provider protocol, including Groq', async () => {
  const store = new ProviderConfigStore(prisma(), key)
  const first = await store.upsert({ name: 'Gemini fast', provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'key-one' })
  const second = await store.upsert({ name: 'Gemini quality', provider: 'gemini', model: 'gemini-2.5-pro', apiKey: 'key-two' })
  const groq = await store.upsert({ name: 'Groq production', provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'key-three' })
  assert.notEqual(first.id, second.id)
  assert.equal(groq.provider, 'groq')
  assert.equal((await store.list()).length, 3)
})
