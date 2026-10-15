import type { OutgoingMessage } from '../types'
import { resolveAssetUrl } from '../api/client'

const SENDER_STORAGE_PREFIX = 'calisto-webchat-sender-id'

/** `session` = this tab only (public visitors); `local` = kept across tabs and restarts (admin console). */
export type SenderStorage = 'session' | 'local'

function storageFor(kind: SenderStorage): Storage {
  return kind === 'local' ? window.localStorage : window.sessionStorage
}

function storageKey(scope: string): string {
  return `${SENDER_STORAGE_PREFIX}:${scope}`
}

export function getOrCreateSenderId(scope = 'website', storage: SenderStorage = 'session'): string {
  if (typeof window === 'undefined') return `${scope}-demo`
  const key = storageKey(scope)
  const existing = storageFor(storage).getItem(key)
  if (existing) return existing
  const created = `${scope}-${crypto.randomUUID()}`
  storageFor(storage).setItem(key, created)
  return created
}

export function persistSenderId(senderId: string, scope = 'website', storage: SenderStorage = 'session'): void {
  if (typeof window === 'undefined') return
  storageFor(storage).setItem(storageKey(scope), senderId)
}

export function resetSenderId(scope = 'website', storage: SenderStorage = 'session'): string {
  const created = `${scope}-${crypto.randomUUID()}`
  persistSenderId(created, scope, storage)
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
