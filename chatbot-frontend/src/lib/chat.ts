import type { OutgoingMessage } from '../types'
import { resolveAssetUrl } from '../api/client'

const SENDER_STORAGE_PREFIX = 'calisto-webchat-sender-id'

function storageKey(scope: string): string {
  return `${SENDER_STORAGE_PREFIX}:${scope}`
}

export function getOrCreateSenderId(scope = 'website'): string {
  if (typeof window === 'undefined') return `${scope}-demo`
  const key = storageKey(scope)
  const existing = window.sessionStorage.getItem(key)
  if (existing) return existing
  const created = `${scope}-${crypto.randomUUID()}`
  window.sessionStorage.setItem(key, created)
  return created
}

export function persistSenderId(senderId: string, scope = 'website'): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(storageKey(scope), senderId)
}

export function resetSenderId(scope = 'website'): string {
  const created = `${scope}-${crypto.randomUUID()}`
  persistSenderId(created, scope)
  return created
}

export function messagePreview(message: OutgoingMessage): string {
  if (message.type === 'text' || message.type === 'choice') return message.text
  if (message.type === 'card') return message.title
  if (message.type === 'image') return message.caption ?? 'Image'
  return ''
}

export function cardImageUrl(imageUrl?: string): string | undefined {
  return resolveAssetUrl(imageUrl)
}
