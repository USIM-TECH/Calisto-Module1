import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatService } from './chat-service.js'
import type { LlmProvider } from './llm-provider.js'
import type { ProductRecord } from '../../products/types.js'

const p0275: ProductRecord = {
  productId: 'P0275', productName: 'RayBan Luxe Sunglasses 275', category: 'Sunglasses',
  productType: 'Luxury Sunglasses', brand: 'Tom Ford', priceMyr: 431.52, stockStatus: 'in_stock',
  bestseller: false, newArrival: false, createdAt: '', updatedAt: '',
}

function store() {
  return {
    distinctProductTypes: async () => ['Luxury Sunglasses'],
    distinctBrands: async () => ['RayBan', 'Tom Ford'],
    listAll: async () => [p0275],
  } as any
}

function logger() {
  return { debug() {}, warn() {}, error() {}, info() {} } as any
}

function retriever() {
  return {
    retrieve: async (_message: string, filters: any) => ({
      productsSearched: filters !== null,
      products: filters?.productName === p0275.productName || filters?.productId === p0275.productId || filters?.productType === 'Luxury Sunglasses' ? [p0275] : [],
      knowledge: [],
    }),
  } as any
}

function service(provider: LlmProvider) {
  return new ChatService(provider, retriever(), store(), { historyTurns: 6 }, logger())
}

test('exact P0275 lookup returns the canonical record despite contradictory brand metadata', async () => {
  const provider: LlmProvider = {
    name: 'test',
    generate: async (messages) => messages[0].content.includes('classify')
      ? JSON.stringify({ intent: 'product', brand: 'RayBan', exact_product_name: 'RayBan Luxe Sunglasses' })
      : JSON.stringify({ text: 'verified', productIds: ['P0275'] }),
    healthCheck: async () => true,
  }
  const result = await service(provider).reply('Do you have RayBan Luxe Sunglasses 275? Show its exact price and product card.')
  assert.deepEqual(result.products.map((product) => product.productId), ['P0275'])
  assert.match(result.text, /RM431\.52/)
})

test('LLM timeout uses the existing safe fallback instead of leaking an exception', async () => {
  const provider: LlmProvider = {
    name: 'timeout-test',
    generate: async () => { throw new Error('Ollama request timeout') },
    healthCheck: async () => false,
  }
  const result = await service(provider).reply('Show me sunglasses')
  assert.match(result.text, /trouble answering right now/i)
  assert.deepEqual(result.products, [])
})

test('missing product ID from structured answer yields a safe no-match result', async () => {
  const provider: LlmProvider = {
    name: 'missing-id-test',
    generate: async (messages) => messages[0].content.includes('classify')
      ? JSON.stringify({ intent: 'product', exact_product_name: 'RayBan Luxe Sunglasses 275' })
      : JSON.stringify({ text: 'verified', productIds: ['P9999'] }),
    healthCheck: async () => true,
  }
  const result = await service(provider).reply('Do you have RayBan Luxe Sunglasses 275?')
  assert.deepEqual(result.products, [])
  assert.match(result.text, /could not find|verified/i)
})

test('mixed greeting and product request does not short-circuit to generic welcome', async () => {
  const provider: LlmProvider = {
    name: 'fake',
    generate: async (messages) => messages[0].content.includes('classify')
      ? JSON.stringify({ intent: 'chitchat' })
      : JSON.stringify({ text: 'grounded', productIds: ['P0275'] }),
    healthCheck: async () => true,
  }
  const result = await service(provider).reply('hi there im looking for cool sunglasses')
  assert.match(result.text, /At RM|matching|P1|Cool Sunglasses/i)
  assert.equal(result.products.length, 1)
})

test('mixed RayBan sunglasses request keeps canonical brand and product type filters', async () => {
  let received: any
  const provider: LlmProvider = {
    name: 'test',
    generate: async (messages) => messages[0].content.includes('classify')
      ? JSON.stringify({ intent: 'chitchat' })
      : JSON.stringify({ text: 'grounded', productIds: ['P0275'] }),
    healthCheck: async () => true,
  }
  const captureRetriever = { retrieve: async (_message: string, filters: any) => { received = filters; return { productsSearched: true, products: [], knowledge: [] } } } as any
  const subject = new ChatService(provider, captureRetriever, store(), { historyTurns: 6 }, logger())
  const result = await subject.reply('I want cool sunglasses RayBan.')
  assert.equal(received.productType, 'Luxury Sunglasses')
  assert.equal(received.brand, 'RayBan')
  assert.match(result.text, /could not find/i)
})

test('brand search excludes a record whose name starts with a different known brand', async () => {
  const contradictory = { ...p0275, productId: 'P0337', productName: 'Gentle Monster Luxe Sunglasses 337', brand: 'RayBan' }
  const provider: LlmProvider = {
    name: 'test',
    generate: async (messages) => messages[0].content.includes('classify')
      ? JSON.stringify({ intent: 'product', product_type: 'Luxury Sunglasses', brand: 'RayBan' })
      : JSON.stringify({ text: 'friendly', productIds: ['P0337'] }),
    healthCheck: async () => true,
  }
  const products = { distinctProductTypes: async () => ['Luxury Sunglasses'], distinctBrands: async () => ['RayBan', 'Gentle Monster'], listAll: async () => [contradictory] } as any
  const retriever = { retrieve: async () => ({ productsSearched: true, products: [contradictory], knowledge: [] }) } as any
  const result = await new ChatService(provider, retriever, products, { historyTurns: 6 }, logger()).reply('Hi, I want RayBan sunglasses')
  assert.deepEqual(result.products, [])
  assert.match(result.text, /could not find/i)
})
