import assert from 'node:assert/strict'
import test from 'node:test'
import { handleMetaChannelWebhook } from '../../../channel-accounts/meta-webhook.js'
import type { RegisteredChannelAccount } from '../../../channel-accounts/channel-account-registry.js'

const logger = { debug() {}, info() {}, warn() {}, error() {} }

function account(id: string, nativeId: string, verifyToken: string): RegisteredChannelAccount {
  return {
    record: {
      id,
      label: id,
      channel: 'messenger',
      nativeId,
      enabled: true,
      responseMode: 'payload',
      verifyToken,
      webhookStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    client: {} as RegisteredChannelAccount['client'],
  }
}

const accounts = [
  account('usim-page', '937322599474110', 'usim-token'),
  account('own-page', '123456789', 'own-token'),
]

async function verify(token: string) {
  return handleMetaChannelWebhook(
    'messenger',
    accounts,
    logger,
    {
      method: 'GET',
      path: '/webhooks/messenger',
      headers: {},
      query: `hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=123456`,
      body: '',
    },
    async () => ({ status: 200 }),
  )
}

test('Messenger accepts each configured account token and echoes the challenge', async () => {
  const usim = await verify('usim-token')
  const own = await verify('own-token')
  assert.deepEqual(usim, { status: 200, body: '123456' })
  assert.deepEqual(own, { status: 200, body: '123456' })
})

test('Messenger rejects a token that belongs to no configured account', async () => {
  const result = await verify('not-configured')
  assert.equal(result.status, 403)
})
