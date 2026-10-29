import assert from 'node:assert/strict'
import test from 'node:test'
import { ChannelAccountRegistry, type RegisteredChannelAccount } from './channel-account-registry.js'

function account(id: string, nativeId: string): RegisteredChannelAccount {
  return {
    record: {
      id,
      label: `Telegram ${nativeId}`,
      channel: 'telegram',
      nativeId,
      enabled: true,
      responseMode: 'payload',
      webhookStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    client: {} as RegisteredChannelAccount['client'],
  }
}

function messengerAccount(id: string, nativeId: string, verifyToken: string): RegisteredChannelAccount {
  return {
    record: {
      id,
      label: `Messenger ${nativeId}`,
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

test('a retained registry reference resolves every Telegram account after replacement', () => {
  const registry = new ChannelAccountRegistry()
  const routerRegistry = registry
  const importedBot = account('imported-bot', '8748074531')
  const testBot = account('test-bot', '8818310700')

  registry.replaceAll([importedBot])
  registry.replaceAll([importedBot, testBot])

  assert.equal(routerRegistry.getById('test-bot'), testBot)
  assert.equal(routerRegistry.getByNativeId('telegram', '8818310700'), testBot)
  assert.equal(routerRegistry.listByChannel('telegram').length, 2)
})

test('a newly added Messenger account is visible through the retained router registry', () => {
  const registry = new ChannelAccountRegistry()
  const routerRegistry = registry
  const imported = messengerAccount('imported-page', '937322599474110', 'usim-token')
  const ownPage = messengerAccount('own-page', '123456789', 'own-token')

  registry.replaceAll([imported])
  registry.replaceAll([imported, ownPage])

  assert.equal(routerRegistry.listByChannel('messenger').length, 2)
  assert.equal(routerRegistry.getById('own-page')?.record.verifyToken, 'own-token')
})
