import type { Express } from 'express'
import { z } from 'zod'
import axios from 'axios'
import type { Logger } from '../utils/index.js'
import type { LlmProviderManager } from './provider-manager.js'
import type { ProviderConfigStore } from './provider-config-store.js'
import type { LlmTelemetry } from './llm-telemetry.js'

const providerSchema = z.enum(['ollama', 'gemini', 'openai', 'anthropic', 'groq'])
const configSchema = z.object({ id: z.string().min(1).max(191).optional(), name: z.string().trim().min(1).max(120), provider: providerSchema, model: z.string().trim().min(1).max(120), apiKey: z.string().max(4096).optional(), enabled: z.boolean().optional() })

function failureCategory(error: unknown): 'invalid_credentials' | 'model_unavailable' | 'permission_or_quota' | 'rate_limited' | 'network_failure' | 'provider_unavailable' | 'unknown_failure' {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const providerStatus = String(error.response?.data?.error?.status ?? '')
    if (status === 401 || providerStatus === 'UNAUTHENTICATED') return 'invalid_credentials'
    if (status === 404 || providerStatus === 'NOT_FOUND' || providerStatus === 'INVALID_ARGUMENT') return 'model_unavailable'
    if (status === 403 || status === 402 || providerStatus === 'PERMISSION_DENIED') return 'permission_or_quota'
    if (status === 429 || providerStatus === 'RESOURCE_EXHAUSTED') return 'rate_limited'
    if (!status || error.code === 'ECONNABORTED') return 'network_failure'
    if (status >= 500) return 'provider_unavailable'
  }
  return 'unknown_failure'
}

export function registerProviderRoutes(app: Express, store: ProviderConfigStore, manager: LlmProviderManager, logger: Logger, telemetry?: LlmTelemetry): void {
  app.get('/admin/ai/metrics', (_req, res) => { res.json(telemetry?.snapshot() ?? { totalRequests: 0, events: [], byProvider: {} }) })
  app.get('/admin/ai/providers', async (_req, res) => {
    try { res.json({ providers: await store.list() }) }
    catch (error: any) { logger.error(`AI provider list failed: ${error?.stack ?? error?.message ?? 'unknown error'}`); res.status(500).json({ error: 'Unable to load AI provider configurations.' }) }
  })
  app.get('/admin/ai/providers/eligible', async (_req, res) => {
    try { res.json({ providers: await store.eligible() }) }
    catch (error: any) { logger.error(`AI eligible-provider lookup failed: ${error?.stack ?? error?.message ?? 'unknown error'}`); res.status(500).json({ error: 'Unable to load eligible AI providers.' }) }
  })
  app.post('/admin/ai/providers', async (req, res) => {
    try { res.status(201).json(await store.upsert(configSchema.parse(req.body ?? {}))) }
    catch (error: any) { logger.error(`AI provider create failed: ${error.message}`); res.status(400).json({ error: 'Unable to save provider configuration.' }) }
  })
  app.put('/admin/ai/providers/:id', async (req, res) => {
    try { res.json(await store.upsert(configSchema.parse({ ...req.body, id: req.params.id }))) }
    catch (error: any) { logger.error(`AI provider save failed: ${error.message}`); res.status(400).json({ error: 'Unable to save provider configuration.' }) }
  })
  app.post('/admin/ai/providers/:id/test', async (req, res) => {
    try {
      const provider = await manager.resolveConfigured(req.params.id)
      await provider.generate([{ role: 'user', content: 'Reply with OK.' }], { temperature: 0 })
      await store.markTest(req.params.id, true)
      res.json({ ok: true, status: 'succeeded', category: 'connection_successful' })
    } catch (error: any) {
      const category = failureCategory(error)
      logger.warn(`AI provider test failed: configuration=${req.params.id} category=${category}`)
      try { await store.markTest(req.params.id, false, category) } catch {}
      res.json({ ok: false, status: 'failed', category })
    }
  })
  app.get('/admin/ai/providers/:id/models', async (req, res) => {
    try { res.json({ models: await manager.discoverGeminiModels(req.params.id) }) }
    catch (error: any) { const category = failureCategory(error); logger.warn(`Gemini model discovery failed: configuration=${req.params.id} category=${category}`); res.status(400).json({ error: 'Unable to discover Gemini models.', category }) }
  })
  app.post('/admin/ai/providers/:id/activate', async (req, res) => { try { await store.activate(req.params.id); res.json({ ok: true }) } catch (error: any) { logger.error(`AI provider activation failed: ${error.message}`); res.status(400).json({ error: 'Unable to activate provider.' }) } })
  app.post('/admin/ai/providers/:id/disable', async (req, res) => { try { await store.disable(req.params.id); res.json({ ok: true }) } catch (error: any) { logger.error(`AI provider disable failed: ${error.message}`); res.status(400).json({ error: 'Unable to disable provider.' }) } })
  app.delete('/admin/ai/providers/:id', async (req, res) => { try { await store.remove(req.params.id); res.status(204).end() } catch (error: any) { logger.error(`AI provider removal failed: ${error.message}`); res.status(400).json({ error: 'Unable to remove provider.' }) } })
}
