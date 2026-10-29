import assert from 'node:assert/strict'
import test from 'node:test'
import { extractGraphApiError, normalizePublicWebhookBaseUrl } from './webhook-utils.js'

test('normalizes a base URL and known webhook paths to the public origin', () => {
  const origin = 'https://example.trycloudflare.com'
  assert.equal(normalizePublicWebhookBaseUrl(origin), origin)
  assert.equal(normalizePublicWebhookBaseUrl(`${origin}/`), origin)
  assert.equal(normalizePublicWebhookBaseUrl(`${origin}/webhooks`), origin)
  assert.equal(normalizePublicWebhookBaseUrl(`${origin}/webhooks/messenger/`), origin)
  assert.equal(normalizePublicWebhookBaseUrl(`${origin}/webhooks/telegram/account-id`), origin)
})

test('rejects an unrelated path from being used as a public base URL', () => {
  assert.throws(() => normalizePublicWebhookBaseUrl('https://example.trycloudflare.com/api'), /public base URL/)
})

test('maps Meta token errors to the selected channel', () => {
  const error = { response: { data: { error: { code: 190, message: 'Invalid OAuth access token' } } } }
  assert.match(extractGraphApiError(error, 'messenger'), /^Messenger access token is expired or invalid\./)
  assert.match(extractGraphApiError(error, 'instagram'), /^Instagram access token is expired or invalid\./)
  assert.match(extractGraphApiError(error, 'whatsapp'), /^WhatsApp access token is expired or invalid\./)
})
