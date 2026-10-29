import assert from 'node:assert/strict'
import test from 'node:test'
import { ProductSearchService } from './product-search.js'
import type { ProductRecord } from '../types.js'

function product(id: string, name: string, price: number, stock = 'in_stock'): ProductRecord {
  return {
    productId: id, productName: name, category: 'Sunglasses', productType: 'Luxury Sunglasses', brand: 'RayBan',
    priceMyr: price, stockStatus: stock, bestseller: false, newArrival: false, createdAt: '', updatedAt: '',
  }
}

function search(rows: ProductRecord[]) {
  return new ProductSearchService({ listAll: async () => rows } as any)
}

test('budget maximum is inclusive and products above it are excluded', async () => {
  const result = await search([product('P1', 'At Limit', 300), product('P2', 'Over Limit', 300.01)]).search({ budgetMax: 300 })
  assert.deepEqual(result.map((row) => row.productId), ['P1'])
})

test('stock requirement excludes unavailable products', async () => {
  const result = await search([product('P1', 'Available', 100), product('P2', 'Unavailable', 90, 'out_of_stock')]).search({ stockRequired: true })
  assert.deepEqual(result.map((row) => row.productId), ['P1'])
})

test('exact product-name lookup does not substitute another model', async () => {
  const exact = { ...product('P0275', 'RayBan Luxe Sunglasses 275', 431.52), brand: 'Tom Ford' }
  const result = await search([exact, product('P0301', 'RayBan Luxe Sunglasses 301', 885.25)]).search({
    brand: 'RayBan', productName: 'RayBan Luxe Sunglasses 275',
  })
  assert.deepEqual(result.map((row) => row.productId), ['P0275'])
})

test('strict budget with no eligible rows returns an empty result', async () => {
  const result = await search([product('P1', 'Over Budget', 561.37)]).search({ budgetMax: 300, stockRequired: true })
  assert.deepEqual(result, [])
})

test('follow-up comparison can be restricted to previously verified product IDs', async () => {
  const result = await search([product('P1', 'First', 100), product('P2', 'Second', 50)]).search({ productIds: ['P1'] })
  assert.deepEqual(result.map((row) => row.productId), ['P1'])
})
