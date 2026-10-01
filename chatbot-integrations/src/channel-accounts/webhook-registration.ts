import axios from 'axios'
import { WebhookRegistrationStatus } from '@prisma/client'
import type { Logger } from '../core/utils/index.js'
import type { RegisteredChannelAccount } from './channel-account-registry.js'
import type { ChannelAccountStore } from './channel-account-store.js'
import type { MessengerCredentials, WhatsAppCredentials } from './credential-types.js'
import type { TelegramChannel } from '../integrations/channels/telegram/client.js'
import type { MessengerChannel } from '../integrations/channels/messenger/client.js'
import {
  assertPublicWebhookBaseUrl,
  extractGraphApiError,
  extractTelegramApiError,
  validateWhatsAppAccessToken,
} from './webhook-utils.js'

export {
  assertPublicWebhookBaseUrl,
  extractGraphApiError,
  extractTelegramApiError,
  validateWhatsAppAccessToken,
} from './webhook-utils.js'

export async function registerTelegramAccountWebhook(
  account: RegisteredChannelAccount,
  publicBaseUrl: string,
  logger: Logger,
): Promise<string> {
  const base = await assertPublicWebhookBaseUrl(publicBaseUrl)
  const webhookUrl = `${base}/webhooks/telegram/${account.record.id}`
  await (account.client as TelegramChannel).setWebhook(webhookUrl)
  logger.info(`Telegram webhook registered for ${account.record.label}: ${webhookUrl}`)
  return webhookUrl
}

export async function registerMessengerAccountWebhook(
  account: RegisteredChannelAccount,
  store: ChannelAccountStore,
  publicBaseUrl: string,
  logger: Logger,
): Promise<string> {
  const base = await assertPublicWebhookBaseUrl(publicBaseUrl)
  const version = account.record.apiVersion ?? 'v23.0'
  const webhookUrl = `${base}/webhooks/messenger`

  const row = (await store.getEnabledRows()).find((r) => r.id === account.record.id)
  if (!row) throw new Error('Account not found')
  const creds = store.decryptRowCredentials(row) as MessengerCredentials
  const appId = account.record.metaAppId ?? creds.clientId
  const appToken = creds.appToken ?? (appId && creds.clientSecret ? `${appId}|${creds.clientSecret}` : undefined)

  // Subscribing the Page alone is not enough: Meta delivers to the app-level
  // `page` callback URL, so point that at this backend too. Without it the
  // account shows 'active' while messages go to a stale (dead tunnel) URL.
  if (appId && appToken) {
    logger.info(`Setting Messenger app-level callback for app ${appId}`)
    const subRes = await axios.post(`https://graph.facebook.com/${version}/${appId}/subscriptions`, null, {
      params: {
        object: 'page',
        callback_url: webhookUrl,
        verify_token: account.record.verifyToken ?? 'calisto_verify',
        fields: 'messages,messaging_postbacks,message_deliveries,message_reads',
        include_values: 'true',
        access_token: appToken,
      },
      timeout: 15_000,
    })
    if (subRes.data?.error) {
      throw new Error(subRes.data.error.message ?? 'Failed to set Messenger app callback')
    }
  } else {
    logger.warn(
      'Messenger app ID / client secret not configured — skipping app-level callback. ' +
      'Add the Meta App ID and Client Secret on this account for full webhook setup.',
    )
  }

  await (account.client as MessengerChannel).subscribeToWebhooks()
  logger.info(`Messenger page subscribed for ${account.record.label}`)
  return webhookUrl
}

export async function registerWhatsAppAccountWebhook(
  account: RegisteredChannelAccount,
  store: ChannelAccountStore,
  publicBaseUrl: string,
  logger: Logger,
): Promise<string> {
  const base = await assertPublicWebhookBaseUrl(publicBaseUrl)
  const version = account.record.apiVersion ?? 'v25.0'
  const webhookUrl = `${base}/webhooks/whatsapp`
  const verifyToken = account.record.verifyToken ?? 'calisto_verify'

  const row = (await store.getEnabledRows()).find((r) => r.id === account.record.id)
  if (!row) throw new Error('Account not found')

  const creds = store.decryptRowCredentials(row) as WhatsAppCredentials
  const appId = account.record.metaAppId ?? creds.clientId
  const appSecret = creds.clientSecret

  await validateWhatsAppAccessToken(creds.accessToken, creds.phoneNumberId, version)

  if (appId && appSecret) {
    const appToken = `${appId}|${appSecret}`
    logger.info(`Setting WhatsApp app-level callback for app ${appId}`)
    const subRes = await axios.post(`https://graph.facebook.com/${version}/${appId}/subscriptions`, null, {
      params: {
        object: 'whatsapp_business_account',
        callback_url: webhookUrl,
        verify_token: verifyToken,
        fields: 'messages',
        include_values: 'true',
        access_token: appToken,
      },
      timeout: 15_000,
    })
    if (subRes.data?.error) {
      throw new Error(subRes.data.error.message ?? 'Failed to set WhatsApp app callback')
    }
  } else {
    logger.warn(
      'WhatsApp metaAppId/clientSecret not configured — skipping app-level callback. ' +
      'Add Meta App ID and Client Secret on this account for full webhook setup.',
    )
  }

  if (creds.wabaId) {
    logger.info(`Subscribing WABA ${creds.wabaId}`)
    const wabaRes = await axios.post(
      `https://graph.facebook.com/${version}/${creds.wabaId}/subscribed_apps`,
      null,
      { headers: { Authorization: `Bearer ${creds.accessToken}` }, timeout: 15_000 },
    )
    if (wabaRes.data?.error) {
      throw new Error(wabaRes.data.error.message ?? 'Failed to subscribe WABA')
    }
  } else {
    logger.warn('WhatsApp wabaId not set — inbound messages may not be delivered until WABA is subscribed.')
  }

  logger.info(`Setting per-number webhook override for ${creds.phoneNumberId}`)
  const phoneRes = await axios.post(
    `https://graph.facebook.com/${version}/${creds.phoneNumberId}`,
    {
      webhook_configuration: {
        override_callback_uri: webhookUrl,
        verify_token: verifyToken,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    },
  )
  if (phoneRes.data?.error) {
    throw new Error(phoneRes.data.error.message ?? 'Failed to set phone number webhook override')
  }

  logger.info(`WhatsApp webhook registered for ${account.record.label}`)
  return webhookUrl
}

export async function registerAccountWebhook(
  account: RegisteredChannelAccount,
  publicBaseUrl: string,
  store: ChannelAccountStore,
  logger: Logger,
): Promise<{ webhookUrl: string; webhookStatus: WebhookRegistrationStatus; webhookError: string | null }> {
  try {
    if (account.record.channel === 'telegram') {
      const webhookUrl = await registerTelegramAccountWebhook(account, publicBaseUrl, logger)
      return { webhookUrl, webhookStatus: WebhookRegistrationStatus.active, webhookError: null }
    }

    if (account.record.channel === 'messenger') {
      const webhookUrl = await registerMessengerAccountWebhook(account, store, publicBaseUrl, logger)
      return { webhookUrl, webhookStatus: WebhookRegistrationStatus.active, webhookError: null }
    }

    if (account.record.channel === 'whatsapp') {
      const webhookUrl = await registerWhatsAppAccountWebhook(account, store, publicBaseUrl, logger)
      return { webhookUrl, webhookStatus: WebhookRegistrationStatus.active, webhookError: null }
    }

    if (account.record.channel === 'instagram') {
      const base = await assertPublicWebhookBaseUrl(publicBaseUrl)
      const webhookUrl = `${base}/webhooks/instagram`
      // Meta has no API to set the Instagram callback, so this stays pending
      // until the first verified delivery flips it to active. The dashboard
      // shows setup instructions for this state — it is not an error.
      return {
        webhookUrl,
        webhookStatus: WebhookRegistrationStatus.pending,
        webhookError: null,
      }
    }

    throw new Error(`Unsupported channel: ${account.record.channel}`)
  } catch (error) {
    const message = account.record.channel === 'telegram'
      ? extractTelegramApiError(error)
      : extractGraphApiError(error)
    await store.updateWebhookState(account.record.id, {
      webhookStatus: WebhookRegistrationStatus.error,
      webhookError: message,
    })
    throw new Error(message)
  }
}
