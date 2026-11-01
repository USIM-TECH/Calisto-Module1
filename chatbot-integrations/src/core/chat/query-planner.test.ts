import assert from 'node:assert/strict'
import test from 'node:test'
import { applyExplicitConstraints, clearExplicitlyUnconstrained, sanitizePlan, scopePlanToMessage } from './query-planner.js'

const vocab = { productTypes: ['Luxury Sunglasses'], brands: ['RayBan'] }

test('sanitizes an explicit budget, count, stock requirement and exact product reference', () => {
  const raw = { intent: 'product', product_type: 'Luxury Sunglasses', budget_max: 999 }
  const plan = applyExplicitConstraints('Recommend three sunglasses under RM300 that are available. Do you have RayBan Luxe Sunglasses 275?', sanitizePlan(raw, vocab))
  assert.equal(plan.filters.productType, 'Luxury Sunglasses')
  assert.equal(plan.filters.budgetMax, 300)
  assert.equal(plan.requestedCount, 3)
  assert.equal(plan.filters.stockRequired, true)
  assert.equal(plan.filters.productName, 'RayBan Luxe Sunglasses 275')
})

test('drops unknown brands and preserves missing budget as unconstrained', () => {
  const plan = sanitizePlan({ intent: 'product', brand: 'NotARealBrand' }, vocab)
  assert.deepEqual(plan.filters, {})
})

test('a fresh recommendation request clears a stale budget while keeping stock', () => {
  const plan = scopePlanToMessage(
    'Recommend three sunglasses currently in stock, with exact names and prices.',
    { intent: 'product', filters: { budgetMax: 300, stockRequired: true }, requestedCount: 3 },
  )
  assert.equal(plan.filters.budgetMax, undefined)
  assert.equal(plan.filters.stockRequired, true)
})

test('a genuine follow-up retains the prior budget scope', () => {
  const plan = scopePlanToMessage(
    'Which of those is cheapest?',
    { intent: 'product', filters: { budgetMax: 300 }, requestedCount: 1 },
  )
  assert.equal(plan.filters.budgetMax, 300)
})

test('show me more options retains the prior budget scope', () => {
  const plan = scopePlanToMessage(
    'Show me more options.',
    { intent: 'product', filters: { budgetMax: 400 }, requestedCount: 1 },
  )
  assert.equal(plan.filters.budgetMax, 400)
})

test('explicit RM ranges retain deterministic lower and upper constraints', () => {
  const plan = applyExplicitConstraints(
    'Recommend three Luxury Sunglasses priced between RM300 and RM600, currently in stock.',
    { intent: 'product', filters: {} },
  )
  assert.equal(plan.filters.budgetMin, 300)
  assert.equal(plan.filters.budgetMax, 600)
  assert.equal(scopePlanToMessage('Recommend three Luxury Sunglasses priced between RM300 and RM600.', plan).filters.budgetMin, 300)
})

test('deterministic exact-name extraction overrides an incomplete LLM name', () => {
  const plan = applyExplicitConstraints(
    'Do you have RayBan Luxe Sunglasses 275? Show its exact price and product card.',
    { intent: 'product', filters: { productName: 'RayBan Luxe Sunglasses' } },
  )
  assert.equal(plan.filters.productName, 'RayBan Luxe Sunglasses 275')
})

test('explicit any brand and no budget clear inherited constraints', () => {
  const plan = clearExplicitlyUnconstrained(
    'Show me sunglasses from any brand with no specific budget.',
    { intent: 'product', filters: { brand: 'RayBan', budgetMax: 500 } },
  )
  assert.deepEqual(plan.filters, {})
})

test('preserves structured material and lens constraints for strict catalogue filtering', () => {
  const plan = sanitizePlan({
    intent: 'product',
    product_type: 'Luxury Sunglasses',
    frame_material: 'Titanium',
    lens_type: 'Single Vision',
    lens_feature: 'Blue Light',
    lens_duration: 'Daily',
  }, vocab)
  assert.equal(plan.filters.frameMaterial, 'Titanium')
  assert.equal(plan.filters.lensType, 'Single Vision')
  assert.equal(plan.filters.lensFeature, 'Blue Light')
  assert.equal(plan.filters.lensDuration, 'Daily')
})
