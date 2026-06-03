import type {
  KnowledgeSummaryResponse,
  LeadsResponse,
  ProductImportMode,
  ProductImportResult,
  ProductListResult,
  WebchatRequest,
  WebchatResponse,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

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
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: isFormData
      ? init?.headers
      : {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
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

export function postWebchatMessage(payload: WebchatRequest): Promise<WebchatResponse> {
  return request<WebchatResponse>('/webchat/message', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getLeads(): Promise<LeadsResponse> {
  return request<LeadsResponse>('/reports/leads')
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

export function getKnowledgePreview(source: string): Promise<{ items: Array<{ text: string }> }> {
  const params = new URLSearchParams({ source, limit: '5' })
  return request<{ items: Array<{ text: string }> }>(`/admin/knowledge/api?${params.toString()}`)
}
