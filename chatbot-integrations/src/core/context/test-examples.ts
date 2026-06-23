/**
 * Context-Aware Query Expansion - Test Examples
 * 
 * This file demonstrates the query expansion capabilities without running full tests.
 * Use these examples to understand how the system works.
 */

import { ContextDetector } from './context-detector.js'

// Initialize detector
const detector = new ContextDetector()

console.log('=== Context-Aware Query Expansion Test Cases ===\n')

// Test 1: Simple References
console.log('1. SIMPLE REFERENCES')
console.log('-------------------')
const simpleQueries = [
  'show that',
  'show this',
  'show it',
  'show those',
  'show the same one',
  'show the previous one',
  'show the earlier one',
]

simpleQueries.forEach((query) => {
  const result = detector.detect(query)
  console.log(`Query: "${query}"`)
  console.log(`  → Match: ${result.hasContext}, Type: ${result.matchType}`)
})
console.log()

// Test 2: Product Modifications
console.log('2. PRODUCT MODIFICATIONS')
console.log('------------------------')
const modQueries = [
  'show blue ones',
  'show black ones',
  'show cheaper ones',
  'show premium ones',
  'show similar ones',
  'show more options',
]

modQueries.forEach((query) => {
  const result = detector.detect(query)
  console.log(`Query: "${query}"`)
  console.log(`  → Match: ${result.hasContext}, Type: ${result.matchType}`)
  if (result.modifiers) {
    console.log(`  → Modifiers:`, result.modifiers)
  }
})
console.log()

// Test 3: Accessories
console.log('3. ACCESSORY QUERIES')
console.log('--------------------')
const accessoryQueries = [
  'lenses for that',
  'case for that',
  'cleaning kit for it',
  'accessories for those',
]

accessoryQueries.forEach((query) => {
  const result = detector.detect(query)
  console.log(`Query: "${query}"`)
  console.log(`  → Match: ${result.hasContext}, Type: ${result.matchType}`)
  if (result.accessoryType) {
    console.log(`  → Accessory Type: ${result.accessoryType}`)
  }
})
console.log()

// Test 4: Comparisons (should NOT expand)
console.log('4. COMPARISON QUERIES (No Expansion)')
console.log('-------------------------------------')
const compQueries = [
  'compare that with titan',
  'is that better',
  'which one is better',
]

compQueries.forEach((query) => {
  const result = detector.detect(query)
  console.log(`Query: "${query}"`)
  console.log(`  → Match: ${result.hasContext}, Type: ${result.matchType}`)
})
console.log()

// Test 5: Regular queries (no context)
console.log('5. REGULAR QUERIES (No Context)')
console.log('--------------------------------')
const regularQueries = [
  'show rayban glasses',
  'i want sunglasses',
  'blue light glasses',
]

regularQueries.forEach((query) => {
  const result = detector.detect(query)
  console.log(`Query: "${query}"`)
  console.log(`  → Match: ${result.hasContext}, Type: ${result.matchType}`)
})
console.log()

console.log('=== Expected Flow ===')
console.log('1. User: "show raymond glasses"')
console.log('   → Redis stores: { brand: "Raymond", product: "glasses" }')
console.log('   → Rasa processes normally')
console.log()
console.log('2. User: "show that"')
console.log('   → Context detected: simple_reference')
console.log('   → Expanded to: "show raymond glasses"')
console.log('   → Rasa receives expanded query')
console.log()
console.log('3. User: "show blue ones"')
console.log('   → Context detected: product_modification')
console.log('   → Expanded to: "show blue raymond glasses"')
console.log('   → Rasa receives expanded query')
console.log()
console.log('4. User: "lenses for that"')
console.log('   → Context detected: accessory')
console.log('   → Expanded to: "lenses for raymond glasses"')
console.log('   → Rasa receives expanded query')
