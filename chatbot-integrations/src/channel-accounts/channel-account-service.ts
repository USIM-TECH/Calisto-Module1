import { WebhookRegistrationStatus } from '@prisma/client'
import type { Logger } from '../core/utils/index.js'
import type { CacheService } from '../cache/index.js'
import type { LeadOrchestrator } from '../leads/index.js'
import {
  buildChannelAccountRegistry,
  ChannelAccountRegistry,
  registerAccountWebhook,
} from './channel-account-registry.js'
import { ChannelAccountStore, validateCredentials } from './channel-account-store.js'
import type { ChannelAccountInput, ChannelAccountUpdateInput, ManagedChannel } from './credential-types.js'

export class ChannelAccountService {
  private _registry: ChannelAccountRegistry = new ChannelAccountRegistry()

  constructor(
    private readonly store: ChannelAccountStore,
    private readonly logger: Logger,
    private readonly cacheService: CacheService,
    private readonly orchestrator: LeadOrchestrator,
    private readonly telegramAliasTtlSec: number,
    private readonly publicBaseUrl?: string,
  ) {}

  public get registry(): ChannelAccountRegistry {
    return this._registry
  }

  public async initialize(): Promise<void> {
    await this.reload()
  }

  public async reload(): Promise<void> {
    this._registry = await buildChannelAccountRegistry({
      store: this.store,
      logger: this.logger,
      cacheService: this.cacheService,
      orchestrator: this.orchestrator,
      telegramAliasTtlSec: this.telegramAliasTtlSec,
      onInstagramTokenRefreshed: async (accountId, accessToken, expiresAt) => {
        await this.store.updateAccessToken(accountId, accessToken, expiresAt)
      },
    })
  }

  public async list() {
    return this.store.list()
  }

  // Instagram's webhook callback can only be configured by hand in the Meta
  // App Dashboard (Meta does not expose an API for it), so registerWebhook()
  // can never confirm success -- it always leaves the account 'pending'. This
  // is the only trustworthy signal that it actually works: a real inbound
  // webhook delivery that passed signature validation. Call it once a
  // message has been routed to a resolved account; it no-ops once the
  // account is already 'active' so it doesn't write to the DB on every
  // message for the rest of the process lifetime.
  public async confirmWebhookActive(accountId: string): Promise<void> {
    const account = this._registry.getById(accountId)
    if (!account || account.record.webhookStatus === WebhookRegistrationStatus.active) {
      return
    }
    await this.store.updateWebhookState(accountId, {
      webhookStatus: WebhookRegistrationStatus.active,
      webhookUrl: account.record.webhookUrl ?? null,
      webhookError: null,
    })
    account.record.webhookStatus = WebhookRegistrationStatus.active
    account.record.webhookError = undefined
  }

  public async get(id: string) {
    return this.store.getById(id)
  }

  public async create(input: ChannelAccountInput) {
    await validateCredentials(input.channel, input.credentials)
    const created = await this.store.create(input)
    await this.reload()
    return created
  }

  public async update(id: string, input: ChannelAccountUpdateInput) {
    if (input.credentials) {
      const existing = await this.store.getById(id)
      if (!existing) return undefined
      const merged = {
        ...(await this.store.getDecryptedCredentials(id)),
        ...input.credentials,
      } as ChannelAccountInput['credentials']
      await validateCredentials(existing.channel, merged)
      input = { ...input, credentials: merged }
    }
    const updated = await this.store.update(id, input)
    if (updated) await this.reload()
    return updated
  }

  public async disable(id: string) {
    const disabled = await this.store.disable(id)
    if (disabled) await this.reload()
    return disabled
  }

  public async validateAccount(id: string, channel: ManagedChannel, credentials: ChannelAccountInput['credentials']) {
    await validateCredentials(channel, credentials)
    return { ok: true as const }
  }

  public async registerWebhook(id: string, publicBaseUrlOverride?: string) {
    const baseUrl = publicBaseUrlOverride?.trim() || this.publicBaseUrl
    if (!baseUrl) {
      throw new Error('PUBLIC_BASE_URL must be set before registering webhooks (or pass publicBaseUrl in the request body)')
    }
    const account = this._registry.getById(id)
    if (!account) {
      throw new Error('Account not found or disabled — enable it before registering webhooks')
    }
    const result = await registerAccountWebhook(account, baseUrl, this.store, this.logger)
    await this.store.updateWebhookState(id, {
      webhookStatus: result.webhookStatus,
      webhookUrl: result.webhookUrl,
      webhookError: result.webhookError,
    })
    return this.store.getById(id)
  }
}
