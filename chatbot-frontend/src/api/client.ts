import type {
  KnowledgeDocumentDetail,
  KnowledgeDocumentsResponse,
  KnowledgeSummaryResponse,
  LeadDetailResponse,
  LeadsResponse,
  ProductImportMode,
  ProductImportResult,
  ProductListResult,
  WebchatRequest,
  WebchatResponse,
} from '../types'

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
  })

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

export function importProductsCsv(file: File, mode: ProductImportMode): Promise<ProductImportResult> {
  const payload = new FormData()
  payload.set('file', file)
  payload.set('mode', mode)
  return request<ProductImportResult>('/admin/products/api/import', {
    method: 'POST',
    body: payload,
  })
}

export function getProductImportTemplateUrl(): string {
  return `${API_BASE_URL}/admin/products/api/import/template.csv`
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
}): Promise<{ source: string; chunkCount: number }> {
  if (payload.file) {
    const formData = new FormData()
    formData.set('source', payload.source)
    formData.set('file', payload.file)
    formData.set('text', payload.text)
    return request<{ source: string; chunkCount: number }>('/admin/knowledge/api/documents', {
      method: 'POST',
      body: formData,
    })
  }

  return request<{ source: string; chunkCount: number }>('/admin/knowledge/api/documents', {
    method: 'POST',
    body: JSON.stringify({ source: payload.source, text: payload.text }),
  })
}

export function getKnowledgePreview(source: string): Promise<{ items: Array<{ text: string }> }> {
  const params = new URLSearchParams({ source, limit: '5' })
  return request<{ items: Array<{ text: string }> }>(`/admin/knowledge/api?${params.toString()}`)
}

export function updateKnowledgeDocument(
  source: string,
  payload: { file?: File | null; text: string },
): Promise<{ source: string; chunkCount: number }> {
  if (payload.file) {
    const formData = new FormData()
    formData.set('file', payload.file)
    formData.set('text', payload.text)
    return request<{ source: string; chunkCount: number }>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}`, {
      method: 'PUT',
      body: formData,
    })
  }

  return request<{ source: string; chunkCount: number }>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}`, {
    method: 'PUT',
    body: JSON.stringify({ text: payload.text }),
  })
}

export function deleteKnowledgeDocument(source: string): Promise<void> {
  return request<void>(`/admin/knowledge/api/documents/${encodeURIComponent(source)}`, {
    method: 'DELETE',
  })
}
