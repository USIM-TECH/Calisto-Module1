import type {
  KnowledgeDocumentDetail,
  KnowledgeDocumentsResponse,
  KnowledgeSummaryResponse,
  LeadDetailResponse,
  LeadsResponse,
  PresetListResult,
  PresetRecord,
  ProductImportMode,
  ProductImportResult,
  ProductListResult,
  WebchatRequest,
  WebchatResponse,
  ChannelAccountInput,
  ChannelAccountListResult,
  ChannelAccountRecord,
  ResponseMode,
  WebchatSettings,
  PublicUrlStatus,
  RegisterAllWebhooksResult,
  AiProviderName,
  AiProviderRecord,
} from '../types'
import { redirectToLogin } from '../lib/auth'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const WEBCHAT_AUTH_TOKEN = import.meta.env.VITE_WEBSITE_AUTH_TOKEN?.trim()

function formatApiError(text: string, status: number): string {
  if (!text) return `Request failed: ${status}`

  try {
    const data = JSON.parse(text) as {
      error?: string
      invalidRows?: Array<{ line: number; productId?: string; reason: string }>
      warnings?: string[]
    }
    const parts = [
      data.error,
      ...(data.warnings ?? []),
      ...(data.invalidRows ?? [])
        .slice(0, 3)
        .map((row) => `Line ${row.line}${row.productId ? ` (${row.productId})` : ''}: ${row.reason}`),
    ].filter(Boolean)

    if ((data.invalidRows?.length ?? 0) > 3) {
      parts.push(`And ${data.invalidRows!.length - 3} more row issue(s).`)
    }

    return parts.length > 0 ? parts.join(' ') : text
  } catch {
    return text
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData
  const headers: Record<string, string> = isFormData
    ? { ...(init?.headers as Record<string, string> | undefined) }
    : {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    // Sends the HttpOnly admin session cookie.
    credentials: 'include',
  })

  if (res.status === 401 && (path.startsWith('/admin') || path.startsWith('/reports'))) {
    redirectToLogin('expired')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(formatApiError(text, res.status))
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

/** Prefix relative asset paths (e.g. /static/products/...) with the API base URL. */
export function resolveAssetUrl(url?: string): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  if (!API_BASE_URL) return url
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

export function postWebchatMessage(payload: WebchatRequest): Promise<WebchatResponse> {
  const headers: Record<string, string> = {}
  if (WEBCHAT_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${WEBCHAT_AUTH_TOKEN}`
  }

  return request<WebchatResponse>('/webchat/message', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
}

export async function generateConversationTitle(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string | null> {
  const headers: Record<string, string> = {}
  if (WEBCHAT_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${WEBCHAT_AUTH_TOKEN}`
  }
  const result = await request<{ title: string | null }>('/webchat/title', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages }),
  })
  return result.title
}

export function getLeads(): Promise<LeadsResponse> {
  return request<LeadsResponse>('/reports/leads')
}

export function getLeadDetail(customerId: string): Promise<LeadDetailResponse> {
  return request<LeadDetailResponse>(`/reports/leads/${encodeURIComponent(customerId)}`)
}

export function getProducts(query?: string): Promise<ProductListResult> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  params.set('limit', '200')
  return request<ProductListResult>(`/admin/products/api?${params.toString()}`)
}

export function getProduct(productId: string): Promise<ProductListResult['items'][number]> {
  return request<ProductListResult['items'][number]>(`/admin/products/api/${encodeURIComponent(productId)}`)
}

export function createProduct(payload: FormData): Promise<ProductListResult['items'][number]> {
  return request<ProductListResult['items'][number]>('/admin/products/api', {
    method: 'POST',
    body: payload,
  })
}

export function updateProduct(productId: string, payload: FormData): Promise<ProductListResult['items'][number]> {
  return request<ProductListResult['items'][number]>(`/admin/products/api/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteProduct(productId: string): Promise<void> {
  return request<void>(`/admin/products/api/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  })
}

export function importProducts(file: File, mode: ProductImportMode): Promise<ProductImportResult> {
  const payload = new FormData()
  payload.set('file', file)
  payload.set('mode', mode)
  return request<ProductImportResult>('/admin/products/api/import', {
    method: 'POST',
    body: payload,
  })
}

/** @deprecated Use importProducts */
export const importProductsCsv = importProducts

export function getProductImportTemplateUrl(): string {
  return `${API_BASE_URL}/admin/products/api/import/template.xlsx`
}

export function getPresets(): Promise<PresetListResult> {
  return request<PresetListResult>('/admin/presets/api')
}

export function createPreset(payload: { name: string; description?: string }): Promise<PresetRecord> {
  return request<PresetRecord>('/admin/presets/api', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updatePreset(id: string, payload: { name?: string; description?: string }): Promise<PresetRecord> {
  return request<PresetRecord>(`/admin/presets/api/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deletePreset(id: string): Promise<void> {
  return request<void>(`/admin/presets/api/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function setActivePreset(presetId: string | null): Promise<PresetListResult> {
  return request<PresetListResult>('/admin/presets/api/active', {
    method: 'POST',
    body: JSON.stringify({ presetId }),
  })
}

export function getProductPresetIds(productId: string): Promise<{ presetIds: string[] }> {
  return request<{ presetIds: string[] }>(`/admin/presets/api/product/${encodeURIComponent(productId)}`)
}

export function setProductPresetIds(productId: string, presetIds: string[]): Promise<{ presetIds: string[] }> {
  return request<{ presetIds: string[] }>(`/admin/presets/api/product/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    body: JSON.stringify({ presetIds }),
  })
}

export function getKnowledgeSummary(): Promise<KnowledgeSummaryResponse> {
  return request<KnowledgeSummaryResponse>('/admin/knowledge/api/summary')
}

export function getKnowledgeDocuments(): Promise<KnowledgeDocumentsResponse> {
  return request<KnowledgeDocumentsResponse>('/admin/knowledge/api/documents')
}

export function getKnowledgeDocument(source: string, limit = 200): Promise<KnowledgeDocumentDetail> {
  const params = new URLSearchParams({ limit: String(limit) })
  return request<KnowledgeDocumentDetail>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}?${params.toString()}`)
}

export function createKnowledgeDocument(payload: {
  file?: File | null
  source: string
  text: string
  title?: string
}): Promise<{ source: string; chunkCount: number }> {
  if (payload.file) {
    const formData = new FormData()
    formData.set('source', payload.source)
    formData.set('file', payload.file)
    formData.set('text', payload.text)
    if (payload.title) formData.set('title', payload.title)
    return request<{ source: string; chunkCount: number }>('/admin/knowledge/api/documents', {
      method: 'POST',
      body: formData,
    })
  }

  return request<{ source: string; chunkCount: number }>('/admin/knowledge/api/documents', {
    method: 'POST',
    body: JSON.stringify({ source: payload.source, text: payload.text, title: payload.title }),
  })
}

export function getKnowledgePreview(source: string): Promise<{ items: Array<{ text: string }> }> {
  const params = new URLSearchParams({ source, limit: '5' })
  return request<{ items: Array<{ text: string }> }>(`/admin/knowledge/api?${params.toString()}`)
}

export function updateKnowledgeDocument(
  source: string,
  payload: { file?: File | null; text: string; title?: string },
): Promise<{ source: string; chunkCount: number }> {
  if (payload.file) {
    const formData = new FormData()
    formData.set('file', payload.file)
    formData.set('text', payload.text)
    if (payload.title) formData.set('title', payload.title)
    return request<{ source: string; chunkCount: number }>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}`, {
      method: 'PUT',
      body: formData,
    })
  }

  return request<{ source: string; chunkCount: number }>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}`, {
    method: 'PUT',
    body: JSON.stringify({ text: payload.text, title: payload.title }),
  })
}

export function deleteKnowledgeDocument(source: string): Promise<void> {
  return request<void>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}`, {
    method: 'DELETE',
  })
}

export function getChannelAccounts(): Promise<ChannelAccountListResult> {
  return request<ChannelAccountListResult>('/admin/channel-accounts/api')
}

export function createChannelAccount(payload: ChannelAccountInput): Promise<ChannelAccountRecord> {
  return request<ChannelAccountRecord>('/admin/channel-accounts/api', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function disableChannelAccount(id: string): Promise<void> {
  return request<void>(`/admin/channel-accounts/api/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function enableChannelAccount(id: string): Promise<ChannelAccountRecord> {
  return request<ChannelAccountRecord>(`/admin/channel-accounts/api/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
  })
}

export function registerChannelAccountWebhook(id: string, publicBaseUrl?: string): Promise<ChannelAccountRecord> {
  return request<ChannelAccountRecord>(`/admin/channel-accounts/api/${encodeURIComponent(id)}/register-webhook`, {
    method: 'POST',
    body: JSON.stringify(publicBaseUrl ? { publicBaseUrl } : {}),
  })
}

export function getPublicUrlStatus(): Promise<PublicUrlStatus> {
  return request<PublicUrlStatus>('/admin/channel-accounts/api/public-url')
}

/** Re-register every enabled channel account's webhook against one public URL. */
export function registerAllChannelWebhooks(publicBaseUrl?: string): Promise<RegisterAllWebhooksResult> {
  return request<RegisterAllWebhooksResult>('/admin/channel-accounts/api/register-all', {
    method: 'POST',
    body: JSON.stringify(publicBaseUrl ? { publicBaseUrl } : {}),
  })
}

export function updateChannelAccount(
  id: string,
  payload: Partial<ChannelAccountInput> & {
    credentials?: Record<string, string | undefined>
    enabled?: boolean
    responseMode?: ResponseMode
  },
): Promise<ChannelAccountRecord> {
  return request<ChannelAccountRecord>(`/admin/channel-accounts/api/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getWebchatSettings(): Promise<WebchatSettings> {
  return request<WebchatSettings>('/admin/webchat/settings')
}

export function updateWebchatSettings(responseMode: ResponseMode): Promise<WebchatSettings> {
  return request<WebchatSettings>('/admin/webchat/settings', {
    method: 'PUT',
    body: JSON.stringify({ responseMode }),
  })
}

export function getAiProviders(): Promise<{ providers: AiProviderRecord[] }> {
  return request<{ providers: AiProviderRecord[] }>('/admin/ai/providers')
}

export function createAiProvider(payload: { name: string; provider: AiProviderName; model: string; apiKey?: string; enabled?: boolean }): Promise<AiProviderRecord> {
  return request<AiProviderRecord>('/admin/ai/providers', { method: 'POST', body: JSON.stringify(payload) })
}
export function saveAiProvider(id: string, payload: { name: string; provider: AiProviderName; model: string; apiKey?: string; enabled?: boolean }): Promise<AiProviderRecord> {
  return request<AiProviderRecord>(`/admin/ai/providers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
}
export function getEligibleAiProviders(): Promise<{ providers: AiProviderRecord[] }> { return request<{ providers: AiProviderRecord[] }>('/admin/ai/providers/eligible') }
export function testAiProvider(id: string): Promise<{ ok: boolean; status: string; category?: string }> {
  return request<{ ok: boolean; status: string; category?: string }>(`/admin/ai/providers/${encodeURIComponent(id)}/test`, { method: 'POST', body: '{}' })
}
export function discoverGeminiModels(id: string): Promise<{ models: Array<{ id: string; displayName: string }> }> {
  return request<{ models: Array<{ id: string; displayName: string }> }>(`/admin/ai/providers/${encodeURIComponent(id)}/models`)
}
export function activateAiProvider(id: string): Promise<{ ok: boolean }> { return request<{ ok: boolean }>(`/admin/ai/providers/${encodeURIComponent(id)}/activate`, { method: 'POST', body: '{}' }) }
export function disableAiProvider(id: string): Promise<{ ok: boolean }> { return request<{ ok: boolean }>(`/admin/ai/providers/${encodeURIComponent(id)}/disable`, { method: 'POST', body: '{}' }) }
export function deleteAiProvider(id: string): Promise<void> { return request<void>(`/admin/ai/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }) }

/** Every product, fetched page by page (the list endpoint caps a page at 500). */
export async function getAllProducts(): Promise<ProductListResult['items']> {
  const items: ProductListResult['items'] = []
  for (let page = 1; ; page += 1) {
    const result = await request<ProductListResult>(`/admin/products/api?limit=500&page=${page}`)
    items.push(...result.items)
    if (items.length >= result.total || result.items.length === 0) return items
  }
}

export function getPresetMembers(presetId: string): Promise<{ productIds: string[] }> {
  return request<{ productIds: string[] }>(`/admin/presets/api/${encodeURIComponent(presetId)}/members`)
}

/** Adds and removes only the listed products; the rest of the preset is untouched. */
export function updatePresetMembers(
  presetId: string,
  changes: { add: string[]; remove: string[] },
): Promise<{ added: number; removed: number; productIds: string[] }> {
  return request<{ added: number; removed: number; productIds: string[] }>(
    `/admin/presets/api/${encodeURIComponent(presetId)}/members`,
    { method: 'PATCH', body: JSON.stringify(changes) },
  )
}
