import assert from 'node:assert/strict'
import test from 'node:test'
import { TelegramGuidedShopping } from './guided-shopping.js'
import type { ProductRecord } from '../../../products/types.js'

function product(id: string, type: string, brand: string, price: number): ProductRecord {
  return { productId: id, productName: `${brand} ${type} ${id}`, category: type, productType: type, brand, priceMyr: price, stockStatus: 'in_stock', bestseller: false, newArrival: false, createdAt: '', updatedAt: '' }
}

function fixture(rows: ProductRecord[]) {
  return { listAll: async () => rows } as any
}

async function run(flow: TelegramGuidedShopping, chat: string, value: string) {
  const sent: any[] = []
  await flow.handle(chat, value, async (message) => { sent.push(message) })
  return sent
}

test('start and category-budget-brand navigation is deterministic and catalogue-backed', async () => {
  const flow = new TelegramGuidedShopping(fixture([
    product('P1', 'Luxury Sunglasses', 'Gucci', 450),
    product('P2', 'Luxury Sunglasses', 'RayBan', 650),
  ]))
  const start = await run(flow, 'chat-1', '/start')
  assert.equal(start[0].type, 'choice')
  assert.match(start[0].options.map((option: any) => option.label).join('|'), /Sunglasses/)
  const budget = await run(flow, 'chat-1', 'tg:guide:category:Luxury Sunglasses')
  assert.equal(budget[0].options[0].label, 'Under RM500')
  const brands = await run(flow, 'chat-1', 'tg:guide:budget:under500')
  assert.deepEqual(brands[0].options.slice(0, 2).map((option: any) => option.label), ['Gucci', 'RayBan'])
  const products = await run(flow, 'chat-1', 'tg:guide:brand:Gucci')
  assert.equal(products[0].type, 'card')
  assert.match(products[0].subtitle, /RM450\.00/)
})

test('any brand and any budget preserve catalogue records without an LLM call', async () => {
  const flow = new TelegramGuidedShopping(fixture([product('P1', 'Luxury Sunglasses', 'Gucci', 950)]))
  await run(flow, 'chat-2', '/start')
  await run(flow, 'chat-2', 'tg:guide:category:Luxury Sunglasses')
  await run(flow, 'chat-2', 'tg:guide:budget:any')
  const result = await run(flow, 'chat-2', 'tg:guide:brand:any')
  assert.equal(result[0].type, 'card')
  assert.match(result[0].subtitle, /Gucci/)
})

test('empty results offer clickable recovery and invalid brands do not widen results', async () => {
  const flow = new TelegramGuidedShopping(fixture([product('P1', 'Luxury Sunglasses', 'Gucci', 950)]))
  await run(flow, 'chat-3', '/start')
  await run(flow, 'chat-3', 'tg:guide:category:Luxury Sunglasses')
  await run(flow, 'chat-3', 'tg:guide:budget:under500')
  const empty = await run(flow, 'chat-3', 'tg:guide:brand:Gucci')
  assert.equal(empty[0].type, 'choice')
  assert.match(empty[0].options.map((option: any) => option.label).join('|'), /Change Budget|Clear Filters/)
  const invalid = await run(flow, 'chat-3', 'tg:guide:brand:NotACatalogueBrand')
  assert.deepEqual(invalid, [])
})

test('back navigation resets only the selected guided scope', async () => {
  const flow = new TelegramGuidedShopping(fixture([product('P1', 'Luxury Sunglasses', 'Gucci', 450)]))
  await run(flow, 'chat-4', '/start')
  await run(flow, 'chat-4', 'tg:guide:category:Luxury Sunglasses')
  const back = await run(flow, 'chat-4', 'tg:guide:back:budget')
  assert.equal(back[0].options[0].label, 'Under RM500')
})
