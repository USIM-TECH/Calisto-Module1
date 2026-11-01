import assert from 'node:assert/strict'
import test from 'node:test'
import { WebsiteChannel } from './client.js'
import { GuidedShoppingEngine } from '../../../core/guided-shopping/guided-shopping-engine.js'
import { ProductSearchService } from '../../../products/service/product-search.js'
import type { ProductRecord } from '../../../products/types.js'

function product(id: string, brand: string, price: number): ProductRecord {
  return { productId: id, productName: `${brand} Sunglasses ${id}`, category: 'Luxury Sunglasses', productType: 'Luxury Sunglasses', brand, priceMyr: price, stockStatus: 'in_stock', bestseller: false, newArrival: false, createdAt: '', updatedAt: '' }
}

function channel(rows: ProductRecord[]) {
  const store = { listAll: async () => rows } as any
  const engine = new GuidedShoppingEngine(store, new ProductSearchService(store))
  const orchestrator = { process: async () => { throw new Error('natural-language orchestrator must not run') } } as any
  return new WebsiteChannel(orchestrator, { debug() {}, info() {}, warn() {}, error() {} } as any, engine)
}

test('website guided actions use the shared engine and return canonical cards without orchestration', async () => {
  const website = channel([product('P1', 'Gucci', 250), product('P2', 'RayBan', 650)])
  const category = await website.handleChat({ senderId: 'visitor-1', message: 'Sunglasses', guidedAction: { action: 'category', value: 'Luxury Sunglasses', eventId: '1' } })
  assert.equal(category.messages[0]?.type, 'choice')
  const budget = await website.handleChat({ senderId: 'visitor-1', message: 'Under RM300', guidedAction: { action: 'budget', value: 'max:300', eventId: '2' } })
  assert.equal(budget.messages[0]?.type, 'choice')
  const result = await website.handleChat({ senderId: 'visitor-1', message: 'Any Brand', guidedAction: { action: 'brand', value: 'any', eventId: '3', stockRequired: true } })
  assert.equal(result.messages[0]?.type, 'card')
  assert.match((result.messages[0] as any).subtitle, /RM250\.00/)
})

test('website guided state is isolated and duplicate event IDs are safe', async () => {
  const website = channel([product('P1', 'Gucci', 250)])
  await website.handleChat({ senderId: 'visitor-a', message: 'Sunglasses', guidedAction: { action: 'category', value: 'Luxury Sunglasses', eventId: 'same' } })
  const duplicate = await website.handleChat({ senderId: 'visitor-a', message: 'Sunglasses', guidedAction: { action: 'category', value: 'Luxury Sunglasses', eventId: 'same' } })
  assert.deepEqual(duplicate.messages, [])
  const isolated = await website.handleChat({ senderId: 'visitor-b', message: 'Under RM300', guidedAction: { action: 'budget', value: 'max:300', eventId: 'other' } })
  assert.deepEqual(isolated.messages, [])
  const invalid = await website.handleChat({ senderId: 'visitor-a', message: 'Unknown', guidedAction: { action: 'brand', value: 'Unknown', eventId: 'invalid' } })
  assert.deepEqual(invalid.messages, [])
})
