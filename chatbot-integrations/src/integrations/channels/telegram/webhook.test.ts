import assert from 'node:assert/strict'
import test from 'node:test'
import { handleTelegramWebhook } from './webhook.js'

const logger = { debug() {}, info() {}, warn() {}, error() {} }

test('Telegram webhooks reject missing or invalid secrets before processing updates', async () => {
  let processed = 0
  const onUpdate = async () => { processed += 1 }
  const base = { logger, req: { method: 'POST', path: '/webhooks/telegram/test', query: '', body: '', headers: {} }, onUpdate }

  const missing = await handleTelegramWebhook({ ...base, config: { botToken: 'bot-token', secretToken: '' } })
  assert.equal(missing.status, 503)

  const invalid = await handleTelegramWebhook({ ...base, config: { botToken: 'bot-token', secretToken: 'valid_secret' } })
  assert.equal(invalid.status, 401)
  assert.equal(processed, 0)
})

test('Telegram webhooks accept a matching secret', async () => {
  const result = await handleTelegramWebhook({
    config: { botToken: 'bot-token', secretToken: 'valid_secret' },
    logger,
    req: {
      method: 'POST',
      path: '/webhooks/telegram/test',
      query: '',
      body: '',
      headers: { 'x-telegram-bot-api-secret-token': 'valid_secret' },
    },
    onUpdate: async () => {},
  })
  assert.equal(result.status, 200)
})
