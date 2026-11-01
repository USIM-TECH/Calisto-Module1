import assert from 'node:assert/strict'
import test from 'node:test'
import { GuidedShoppingEngine } from './guided-shopping-engine.js'
import { ProductSearchService } from '../../products/service/product-search.js'
import type { ProductRecord } from '../../products/types.js'

function product(id: string, brand: string, price: number, stockStatus = 'in_stock'): ProductRecord {
  return { productId: id, productName: `${brand} Frame ${id}`, category: 'Luxury Sunglasses', productType: 'Luxury Sunglasses', brand, priceMyr: price, stockStatus, bestseller: false, newArrival: false, createdAt: '', updatedAt: '' }
}

function setup(rows: ProductRecord[]) {
  let listCalls = 0
  const store = { listAll: async () => { listCalls += 1; return rows } } as any
  return { engine: new GuidedShoppingEngine(store, new ProductSearchService(store)), get listCalls() { return listCalls } }
}

const scope = (conversationId: string, accountId = 'a', channel = 'telegram') => ({ accountId, channel, conversationId })

async function command(engine: GuidedShoppingEngine, conversationId: string, action: any, value?: string, eventId?: string, accountId = 'a', channel = 'telegram') {
  return engine.handle(scope(conversationId, accountId, channel), { action, value, eventId })
}

test('guided engine keeps strict filters, excludes shown products, and has no LLM dependency', async () => {
  const fixture = setup([
    product('P1', 'Gucci', 450), product('P2', 'Gucci', 460), product('P3', 'Gucci', 470), product('P4', 'Gucci', 480), product('P5', 'Gucci', 490), product('P6', 'Gucci', 510),
  ])
  const { engine } = fixture
  await command(engine, 'c', 'start')
  await command(engine, 'c', 'category', 'Luxury Sunglasses')
  await command(engine, 'c', 'budget', 'under500')
  const first = await command(engine, 'c', 'brand', 'Gucci')
  const firstIds = first.responses.filter((item: any) => item.type === 'card').map((item: any) => item.product.productId)
  assert.deepEqual(firstIds, ['P1', 'P2', 'P3', 'P4'])
  const more = await command(engine, 'c', 'showMore')
  assert.deepEqual(more.responses.filter((item: any) => item.type === 'card').map((item: any) => item.product.productId), ['P5'])
})

test('state is isolated by account, channel and conversation and duplicate events are ignored', async () => {
  const { engine } = setup([product('P1', 'Gucci', 450)])
  await command(engine, 'same', 'start', undefined, undefined, 'a')
  await command(engine, 'same', 'category', 'Luxury Sunglasses', undefined, 'a')
  const duplicateStart = await command(engine, 'same', 'start', undefined, 'evt-1', 'a')
  assert.equal(duplicateStart.responses.length, 1)
  const duplicate = await command(engine, 'same', 'start', undefined, 'evt-1', 'a')
  assert.deepEqual(duplicate.responses, [])
  const isolated = await command(engine, 'same', 'budget', 'under500', undefined, 'b')
  assert.deepEqual(isolated.responses, [])
  const isolatedChannel = await command(engine, 'same', 'budget', 'under500', undefined, 'a', 'whatsapp')
  assert.deepEqual(isolatedChannel.responses, [])
})

test('stale or invalid actions do not widen a guided search', async () => {
  const { engine } = setup([product('P1', 'Gucci', 450)])
  await command(engine, 'c', 'start')
  const staleBrand = await command(engine, 'c', 'brand', 'Gucci')
  assert.deepEqual(staleBrand.responses, [])
  await command(engine, 'c', 'category', 'Luxury Sunglasses')
  await command(engine, 'c', 'budget', 'under500')
  const invalid = await command(engine, 'c', 'brand', 'Not Catalogue')
  assert.deepEqual(invalid.responses, [])
})
