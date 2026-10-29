import assert from 'node:assert/strict'
import test from 'node:test'
import { chatReplyToNlpResponse } from './reply-mapper.js'

test('Chat mode keeps the existing channel card wire shape used beside Payload mode', () => {
  const response = chatReplyToNlpResponse({
    text: 'Verified option',
    products: [{
      productId: 'P0275', productName: 'RayBan Luxe Sunglasses 275', category: 'Sunglasses',
      productType: 'Luxury Sunglasses', brand: 'Tom Ford', priceMyr: 431.52, stockStatus: 'in_stock',
      bestseller: false, newArrival: false, createdAt: '', updatedAt: '',
    }],
  })
  assert.equal(response.text, 'Verified option')
  assert.equal(response.raw[1].custom?.type, 'card')
  assert.equal(response.raw[1].custom?.title, 'RayBan Luxe Sunglasses 275')
})
