import type { WebhookRequest, WebhookResponse } from '../core/types.js'
import { validateMetaSignature, type Logger } from '../core/utils/index.js'
import type { RegisteredChannelAccount } from './channel-account-registry.js'
import type { ManagedChannel } from './credential-types.js'

function extractWhatsAppPhoneNumberId(body: string): string | undefined {
  try {
    const payload = JSON.parse(body) as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> }
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const id = change.value?.metadata?.phone_number_id
        if (id) return id
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

function extractMetaEntryIds(body: string): string[] {
  try {
    const payload = JSON.parse(body) as { entry?: Array<{ id?: string }> }
    return (payload.entry ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id))
  } catch {
    return []
  }
}

function matchVerifyToken(accounts: RegisteredChannelAccount[], token: string | null): boolean {
  if (!token) return false
  return accounts.some((account) => account.record.verifyToken === token)
}

function validateMetaSignatureForAccounts(
  body: string,
  signatureHeader: string | undefined,
  accounts: RegisteredChannelAccount[],
): { valid: boolean; error?: string } {
  const secrets = [...new Set(accounts.map((a) => a.clientSecret).filter(Boolean) as string[])]
  if (secrets.length === 0) {
    return { valid: true }
  }
  for (const secret of secrets) {
    const result = validateMetaSignature(body, signatureHeader, secret)
    if (result.valid) return result
  }
  return { valid: false, error: 'Signature validation failed for all configured Meta app secrets' }
}

export async function handleMetaChannelWebhook(
  channel: Extract<ManagedChannel, 'whatsapp' | 'instagram' | 'messenger'>,
  accounts: RegisteredChannelAccount[],
  logger: Logger,
  req: WebhookRequest,
  handler: (account: RegisteredChannelAccount, req: WebhookRequest) => Promise<WebhookResponse>,
): Promise<WebhookResponse> {
  const queryParams = new URLSearchParams(req.query)
  if (queryParams.has('hub.mode')) {
    const mode = queryParams.get('hub.mode')
    const token = queryParams.get('hub.verify_token')
    const challenge = queryParams.get('hub.challenge')
    if (mode === 'subscribe' && matchVerifyToken(accounts, token)) {
      logger.info(`${channel} webhook verified successfully`)
      return { status: 200, body: challenge ?? '' }
    }
    logger.warn(`${channel} webhook verification failed`)
    return { status: 403, body: 'Forbidden' }
  }

  if (req.body) {
    const signature = validateMetaSignatureForAccounts(req.body, req.headers['x-hub-signature-256'], accounts)
    if (!signature.valid) {
      logger.error(`${channel} webhook signature validation failed: ${signature.error}`)
      return { status: 401, body: signature.error }
    }
  }

  if (!req.body) {
    return { status: 200 }
  }

  if (channel === 'whatsapp') {
    const phoneNumberId = extractWhatsAppPhoneNumberId(req.body)
    if (!phoneNumberId) {
      logger.warn('WhatsApp webhook missing phone_number_id — ignoring')
      return { status: 200 }
    }
    const account = accounts.find((entry) => entry.record.nativeId === phoneNumberId)
    if (!account) {
      logger.warn(`No WhatsApp account registered for phone_number_id=${phoneNumberId}`)
      return { status: 200 }
    }
    return handler(account, req)
  }

  const entryIds = extractMetaEntryIds(req.body)
  if (entryIds.length === 0) {
    return { status: 200 }
  }

  let lastResponse: WebhookResponse = { status: 200 }
  for (const entryId of entryIds) {
    const account = accounts.find((entry) => entry.record.nativeId === entryId)
    if (!account) {
      logger.warn(`No ${channel} account registered for entry.id=${entryId}`)
      continue
    }
    lastResponse = await handler(account, req)
  }
  return lastResponse
}
