import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetOptions, buildGuidedSearchRequest, guidedCategories, guidedSelectionLabel } from './guided-shopping.js'

const sunglasses = guidedCategories[0]

test('guided request preserves both sides of a budget range and availability', () => {
  const request = buildGuidedSearchRequest({ category: sunglasses, budget: budgetOptions[1], inStock: true })
  assert.match(request, /Luxury Sunglasses/)
  assert.match(request, /between RM300 and RM600/)
  assert.match(request, /currently in stock/)
})

test('guided request only includes actual chosen filters', () => {
  const request = buildGuidedSearchRequest({ category: sunglasses, budget: budgetOptions[4], brand: 'Ray-Ban' })
  assert.match(request, /by Ray-Ban/)
  assert.doesNotMatch(request, /priced/)
  assert.equal(guidedSelectionLabel({ category: sunglasses, budget: budgetOptions[4], brand: 'Ray-Ban' }), 'Find Sunglasses · Ray-Ban')
})
