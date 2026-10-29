import type { PrismaClient } from '@prisma/client'
import { decryptCredentials, encryptCredentials } from '../../channel-accounts/encryption.js'
import type { HostedLlmProviderName } from './llm-provider.js'

export type ConfiguredProvider = HostedLlmProviderName | 'ollama'
export interface ProviderConfigInput { id?: string; name: string; provider: ConfiguredProvider; model: string; apiKey?: string; enabled?: boolean }
export interface ProviderConfigWire { id: string; name: string; provider: ConfiguredProvider; model: string; enabled: boolean; configured: boolean; eligible: boolean; active: boolean; lastTestAt?: string; lastTestStatus?: 'succeeded' | 'failed'; lastTestCategory?: string }

type ProviderRow = { id: string; name: string; provider: string; model: string; enabled: boolean; active: boolean; apiKeyEncrypted: string | null; lastTestAt: Date | null; lastTestStatus: string | null }
type ActiveConfig = { id: string; provider: ConfiguredProvider; model: string; apiKey?: string }
const hosted = new Set<ConfiguredProvider>(['gemini', 'openai', 'anthropic', 'groq'])

export class ProviderConfigStore {
  constructor(private readonly _prisma: PrismaClient, private readonly _encryptionKey: string) {}

  public async list(): Promise<ProviderConfigWire[]> {
    const rows = await (this._prisma as any).llmProviderConfig.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }) as ProviderRow[]
    return rows.map((row) => this._wire(row))
  }
  public async eligible(): Promise<ProviderConfigWire[]> { return (await this.list()).filter((row) => row.eligible) }

  public async upsert(input: ProviderConfigInput): Promise<ProviderConfigWire> {
    const name = input.name.trim(); const model = input.model.trim()
    if (!name || !model) throw new Error('Configuration name and model are required')
    const existing = input.id ? await (this._prisma as any).llmProviderConfig.findUnique({ where: { id: input.id } }) as ProviderRow | null : null
    if (existing && existing.provider !== input.provider) throw new Error('Provider protocol cannot be changed; create a new configuration')
    const data: Record<string, unknown> = { name, model, provider: input.provider, enabled: input.enabled ?? existing?.enabled ?? true }
    if (input.apiKey?.trim()) data.apiKeyEncrypted = encryptCredentials(input.apiKey.trim(), this._encryptionKey)
    const row = existing ? await (this._prisma as any).llmProviderConfig.update({ where: { id: existing.id }, data }) : await (this._prisma as any).llmProviderConfig.create({ data })
    return this._wire(row as ProviderRow)
  }

  public async activate(id: string): Promise<void> {
    const target = await this._get(id)
    if (!this._eligible(target)) throw new Error('Only enabled, validated configurations can be activated')
    await (this._prisma as any).$transaction([(this._prisma as any).llmProviderConfig.updateMany({ data: { active: false } }), (this._prisma as any).llmProviderConfig.update({ where: { id }, data: { active: true } })])
  }
  public async disable(id: string): Promise<void> { const target = await this._get(id); if (target.active) throw new Error('Activate another validated configuration before disabling this one'); await (this._prisma as any).llmProviderConfig.update({ where: { id }, data: { enabled: false } }) }
  public async remove(id: string): Promise<void> { const target = await this._get(id); if (target.active) throw new Error('Active configuration cannot be removed'); await (this._prisma as any).llmProviderConfig.delete({ where: { id } }) }
  public async getActive(): Promise<ActiveConfig | undefined> { const row = await (this._prisma as any).llmProviderConfig.findFirst({ where: { active: true, enabled: true } }) as ProviderRow | null; return row ? this._secret(row) : undefined }
  public async getConfigured(id: string): Promise<(ActiveConfig & { enabled: boolean }) | undefined> { const row = await (this._prisma as any).llmProviderConfig.findUnique({ where: { id } }) as ProviderRow | null; return row ? { ...this._secret(row), enabled: row.enabled } : undefined }
  public async markTest(id: string, ok: boolean, category?: string): Promise<void> { await (this._prisma as any).llmProviderConfig.update({ where: { id }, data: { lastTestAt: new Date(), lastTestStatus: ok ? 'succeeded' : `failed:${category ?? 'unknown_failure'}` } }) }
  public async ensureOllama(model: string): Promise<void> { const existing = await (this._prisma as any).llmProviderConfig.findFirst({ where: { provider: 'ollama' } }) as ProviderRow | null; if (!existing) await (this._prisma as any).llmProviderConfig.create({ data: { id: 'ollama-default', name: 'Local Ollama', provider: 'ollama', model, enabled: true, active: true, lastTestStatus: 'succeeded', lastTestAt: new Date() } }) }

  private async _get(id: string): Promise<ProviderRow> { const row = await (this._prisma as any).llmProviderConfig.findUnique({ where: { id } }) as ProviderRow | null; if (!row) throw new Error('Provider configuration was not found'); return row }
  private _secret(row: ProviderRow): ActiveConfig { return { id: row.id, provider: row.provider as ConfiguredProvider, model: row.model, apiKey: row.apiKeyEncrypted ? decryptCredentials(row.apiKeyEncrypted, this._encryptionKey) : undefined } }
  private _eligible(row: ProviderRow): boolean { return row.enabled && row.lastTestStatus === 'succeeded' && (!hosted.has(row.provider as ConfiguredProvider) || Boolean(row.apiKeyEncrypted)) }
  private _wire(row: ProviderRow): ProviderConfigWire { const failed = row.lastTestStatus?.startsWith('failed:'); return { id: row.id, name: row.name, provider: row.provider as ConfiguredProvider, model: row.model, enabled: row.enabled, configured: row.provider === 'ollama' || Boolean(row.apiKeyEncrypted), eligible: this._eligible(row), active: row.active, lastTestAt: row.lastTestAt?.toISOString(), lastTestStatus: row.lastTestStatus === 'succeeded' ? 'succeeded' : (failed || row.lastTestStatus === 'failed') ? 'failed' : undefined, lastTestCategory: failed ? row.lastTestStatus?.slice('failed:'.length) : undefined } }
}
