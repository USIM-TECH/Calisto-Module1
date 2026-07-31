import type { OutgoingMessage } from '../types.js'

function absolutizeUrl(value: string | undefined, base?: string): string | undefined {
  if (!value) return value
  if (/^https?:\/\//i.test(value)) return value
  if (!base) return value
  return `${base.replace(/\/$/, '')}${value.startsWith('/') ? value : `/${value}`}`
}

/** Ensure image/card URLs in webchat responses are absolute for browser clients. */
export function absolutizeOutgoingMessages(
  messages: OutgoingMessage[],
  baseUrl?: string,
): OutgoingMessage[] {
  if (!baseUrl) return messages

  return messages.map((message) => {
    if (message.type === 'card') {
      return {
        ...message,
        imageUrl: absolutizeUrl(message.imageUrl, baseUrl),
      }
    }
    if (message.type === 'image') {
      return {
        ...message,
        imageUrl: absolutizeUrl(message.imageUrl, baseUrl) ?? message.imageUrl,
      }
    }
    return message
  })
}
