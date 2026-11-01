import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeLogText } from './log-sanitizer.js'

test('redacts credentials and personal contact data from diagnostics', () => {
  const safe = sanitizeLogText('apiKey=secret-value Bearer abc123 user@example.com +60 12-345 6789')
  assert.equal(safe.includes('secret-value'), false)
  assert.equal(safe.includes('abc123'), false)
  assert.equal(safe.includes('user@example.com'), false)
  assert.equal(safe.includes('12-345 6789'), false)
})
