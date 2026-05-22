import type {
  KnowledgeSummaryResponse,
  LeadsResponse,
  ProductListResult,
  WebchatRequest,
  WebchatResponse,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
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

export function getKnowledgeSummary(): Promise<KnowledgeSummaryResponse> {
  return request<KnowledgeSummaryResponse>('/admin/knowledge/api/summary')
}

export function getKnowledgePreview(source: string): Promise<{ items: Array<{ text: string }> }> {
  const params = new URLSearchParams({ source, limit: '5' })
  return request<{ items: Array<{ text: string }> }>(`/admin/knowledge/api?${params.toString()}`)
}
