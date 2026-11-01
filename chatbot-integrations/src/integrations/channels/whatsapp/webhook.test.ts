import assert from 'node:assert/strict'
import test from 'node:test'
import { handleWhatsAppWebhook } from './webhook.js'

const logger = { debug() {}, info() {}, warn() {}, error() {} } as any
const config = { accessToken: 'token', phoneNumberId: 'phone', verifyToken: 'verify', clientSecret: 'secret' } as any

test('WhatsApp rejects malformed JSON without invoking the message handler', async () => {
  let processed = 0
  const result = await handleWhatsAppWebhook({
    config: { ...config, clientSecret: undefined },
    logger,
    req: { method: 'POST', path: '/webhooks/whatsapp', query: {} as any, headers: {}, body: '{' },
    onMessage: async () => { processed += 1 },
  })
  assert.equal(result.status, 400)
  assert.equal(processed, 0)
})

test('WhatsApp rejects an invalid Meta signature when an app secret is configured', async () => {
  const result = await handleWhatsAppWebhook({
    config,
    logger,
    req: { method: 'POST', path: '/webhooks/whatsapp', query: {} as any, headers: { 'x-hub-signature-256': 'sha256=invalid' }, body: '{}' },
    onMessage: async () => {},
  })
  assert.equal(result.status, 401)
})
