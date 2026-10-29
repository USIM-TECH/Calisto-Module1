import assert from 'node:assert/strict'
import test from 'node:test'
import { Answerer, buildContextBlock, type StructuredChatAnswer } from './answerer.js'
import { validateSelectedProducts } from './chat-service.js'
import type { LlmProvider } from './llm-provider.js'
import type { RetrievedContext } from './retriever.js'
import type { ProductRecord } from '../../products/types.js'

function product(productId: string, productName: string, priceMyr: number, stockStatus = 'in_stock'): ProductRecord {
  return {
    productId,
    productName,
    category: 'Sunglasses',
    productType: 'Luxury Sunglasses',
    brand: 'Tom Ford',
    priceMyr,
    stockStatus,
    bestseller: false,
    newArrival: false,
    createdAt: '',
    updatedAt: '',
  }
}

function context(products: ProductRecord[]): RetrievedContext {
  return { productsSearched: true, products, knowledge: [] }
}

function provider(response: string): LlmProvider {
  return {
    name: 'test',
    generate: async () => response,
    healthCheck: async () => true,
  }
}

test('Answerer requests one structured response and includes candidate IDs in context', async () => {
  const candidate = product('P0275', 'RayBan Luxe Sunglasses 275', 431.52)
  let options: any
  let messages: any
  const llm: LlmProvider = {
    name: 'test',
    generate: async (input, generateOptions) => {
      messages = input
      options = generateOptions
      return JSON.stringify({ text: 'A suitable option for your request.', productIds: ['P0275'] })
    },
    healthCheck: async () => true,
  }
  const answer = await new Answerer(llm).answer('show me sunglasses', [], context([candidate]))
  assert.deepEqual(answer, { text: 'A suitable option for your request.', productIds: ['P0275'] })
  assert.equal(options.temperature, 0)
  assert.ok(options.jsonSchema)
  assert.match(messages[0].content, /\[id: P0275\]/)
})

test('invalid, duplicate and unavailable IDs are rejected while valid multiple products remain canonical', () => {
  const first = product('P1', 'First', 100)
  const second = product('P2', 'Second', 200)
  const unavailable = product('P3', 'Unavailable', 300, 'out_of_stock')
  const answer: StructuredChatAnswer = { text: 'irrelevant', productIds: ['P1', 'P1', 'missing', 'P3', 'P2'] }
  assert.deepEqual(validateSelectedProducts(answer, [first, second, unavailable]), [first, second])
})

test('a model price cannot replace the canonical product price used by the response', () => {
  const candidate = product('P0275', 'RayBan Luxe Sunglasses 275', 431.52)
  const selected = validateSelectedProducts(
    { text: 'RayBan Luxe Sunglasses 275 costs RM99.00', productIds: ['P0275'] },
    [candidate],
  )
  assert.equal(selected[0].priceMyr, 431.52)
  assert.equal(buildContextBlock(context([candidate])).includes('RM431.52'), true)
})

test('no retrieved products cannot validate any recommendation', () => {
  assert.deepEqual(validateSelectedProducts({ text: 'anything', productIds: ['P0275'] }, []), [])
})

test('the P0275 scenario selects the exact persisted row only when its ID is returned', () => {
  const exact = product('P0275', 'RayBan Luxe Sunglasses 275', 431.52)
  const unrelated = product('P0301', 'RayBan Luxe Sunglasses 301', 885.25)
  assert.deepEqual(validateSelectedProducts({ text: '', productIds: ['P0275'] }, [exact, unrelated]), [exact])
  assert.deepEqual(validateSelectedProducts({ text: '', productIds: ['P9999'] }, [exact, unrelated]), [])
})

test('invalid structured JSON is rejected by Answerer', async () => {
  await assert.rejects(
    () => new Answerer(provider('{"text":"missing ids"}')).answer('show me sunglasses', [], context([])),
    /invalid structured response/,
  )
})
