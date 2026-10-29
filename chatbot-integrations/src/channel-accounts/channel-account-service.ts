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
import { detectTunnelUrl, type PublicBaseUrl } from '../app/public-base-url.js'
import { assertPublicWebhookBaseUrl } from './webhook-utils.js'

export interface WebhookRegistrationResult {
  id: string
  label: string
  channel: ManagedChannel
  /** `manual` = needs a step in the provider's dashboard (Instagram). */
  status: 'active' | 'error' | 'manual'
  webhookUrl?: string
  error?: string
}

// Pause between accounts so back-to-back calls don't trip Telegram/Meta timeouts.
const REGISTER_ALL_DELAY_MS = 1_500

export class ChannelAccountService {
  // Keep this object stable. The webhook router and response-mode resolver retain
  // a reference to it when the application starts, so replacing the instance on
  // account changes leaves those consumers looking at stale account mappings.
  private readonly _registry = new ChannelAccountRegistry()

  constructor(
    private readonly store: ChannelAccountStore,
    private readonly logger: Logger,
    private readonly cacheService: CacheService,
    private readonly orchestrator: LeadOrchestrator,
    private readonly telegramAliasTtlSec: number,
    private readonly publicBaseUrl: PublicBaseUrl,
    private readonly cloudflaredMetricsPort?: number,
  ) {}

  public get registry(): ChannelAccountRegistry {
    return this._registry
  }

  public async initialize(): Promise<void> {
    await this.reload()
  }

  public async reload(): Promise<void> {
    const reloaded = await buildChannelAccountRegistry({
      store: this.store,
      logger: this.logger,
      cacheService: this.cacheService,
      orchestrator: this.orchestrator,
      telegramAliasTtlSec: this.telegramAliasTtlSec,
      onInstagramTokenRefreshed: async (accountId, accessToken, expiresAt) => {
        await this.store.updateAccessToken(accountId, accessToken, expiresAt)
      },
    })
    this._registry.replaceAll(reloaded.list())
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
    const baseUrl = publicBaseUrlOverride?.trim() || this.publicBaseUrl.get()
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

  /** The URL currently in use plus a live cloudflared tunnel URL, if one is running. */
  public async getPublicUrlStatus() {
    return {
      current: this.publicBaseUrl.get() ?? null,
      detected: (await detectTunnelUrl(this.cloudflaredMetricsPort)) ?? null,
    }
  }

  /**
   * Point every enabled channel account at one public URL (what
   * scripts/register-all-webhooks.sh did). Uses the given URL, else the live
   * tunnel URL, else the current one. The URL also becomes the backend's public
   * URL, so product images resolve against it straight away.
   */
  public async registerAll(publicBaseUrlOverride?: string) {
    const baseUrl =
      publicBaseUrlOverride?.trim() ||
      (await detectTunnelUrl(this.cloudflaredMetricsPort)) ||
      this.publicBaseUrl.get()
    if (!baseUrl) {
      throw new Error('No public URL found. Start cloudflared (cloudflared tunnel --url http://localhost:3000) or enter the URL.')
    }
    // Fail fast with one clear error if the URL is wrong, instead of one per account.
    const publicUrl = await assertPublicWebhookBaseUrl(baseUrl)
    this.publicBaseUrl.set(publicUrl)
    this.logger.info(`Public base URL set to ${publicUrl}; registering all channel webhooks`)

    const results: WebhookRegistrationResult[] = []
    const accounts = this._registry.list()
    for (const [index, account] of accounts.entries()) {
      const { id, label, channel } = account.record
      try {
        const updated = await this.registerWebhook(id, publicUrl)
        results.push({
          id,
          label,
          channel,
          status: channel === 'instagram' ? 'manual' : 'active',
          webhookUrl: updated?.webhookUrl ?? undefined,
          error: channel === 'instagram' ? updated?.webhookError ?? undefined : undefined,
        })
      } catch (error: any) {
        results.push({ id, label, channel, status: 'error', error: error.message })
      }
      if (index < accounts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, REGISTER_ALL_DELAY_MS))
      }
    }

    return { publicBaseUrl: publicUrl, results }
  }
}
