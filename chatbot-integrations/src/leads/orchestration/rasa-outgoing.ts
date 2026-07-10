import type { OutgoingMessage } from '../../core/types.js'
import type { NLPResponse } from '../../core/utils/index.js'

function normalizeCardMessage(custom: Record<string, unknown>): OutgoingMessage | undefined {
  const title = typeof custom.title === 'string' ? custom.title : undefined
  if (!title) {
    return undefined
  }

  const subtitle = typeof custom.subtitle === 'string' ? custom.subtitle : undefined
  const imageUrl = typeof custom.imageUrl === 'string' ? custom.imageUrl : undefined
  const actions = Array.isArray(custom.actions)
    ? custom.actions
        .map((action) => {
          if (!action || typeof action !== 'object') {
            return undefined
          }
          const payload = action as Record<string, unknown>
          const type = payload.type === 'url' || payload.type === 'postback' ? payload.type : undefined
          const actionTitle = typeof payload.title === 'string' ? payload.title : undefined
          const value = typeof payload.value === 'string' ? payload.value : undefined
          if (!type || !actionTitle || !value) {
            return undefined
          }
          return { type: type as 'url' | 'postback', title: actionTitle, value }
        })
        .filter((action): action is NonNullable<typeof action> => Boolean(action))
    : undefined

  return {
    type: 'card',
    title,
    subtitle,
    imageUrl,
    actions,
  }
}

function normalizeLocationMessage(custom: Record<string, unknown>): OutgoingMessage | undefined {
  const latitude = typeof custom.latitude === 'number' ? custom.latitude : undefined
  const longitude = typeof custom.longitude === 'number' ? custom.longitude : undefined
  if (latitude === undefined || longitude === undefined) {
    return undefined
  }

  return {
    type: 'location',
    latitude,
    longitude,
    name: typeof custom.name === 'string' ? custom.name : undefined,
    address: typeof custom.address === 'string' ? custom.address : undefined,
  }
}

export function mapNlpResponseToOutgoingMessages(nlpResponse: NLPResponse): OutgoingMessage[] {
  const outgoingMessages: OutgoingMessage[] = []

  for (const reply of nlpResponse.raw) {
    if (reply.custom && typeof reply.custom === 'object') {
      const custom = reply.custom as Record<string, unknown>
      if (custom.type === 'card') {
        const card = normalizeCardMessage(custom)
        if (card) {
          outgoingMessages.push(card)
          continue
        }
      }

      if (custom.type === 'location') {
        const location = normalizeLocationMessage(custom)
        if (location) {
          outgoingMessages.push(location)
          continue
        }
      }
    }

    if (reply.image) {
      outgoingMessages.push({ type: 'image', imageUrl: reply.image })
    }

    if (reply.buttons && reply.buttons.length > 0 && reply.text) {
      outgoingMessages.push({
        type: 'choice',
        text: reply.text,
        options: reply.buttons.map((btn: { title: string; payload: string }) => ({
          label: btn.title,
          value: btn.payload,
          type: btn.payload.startsWith('http://') || btn.payload.startsWith('https://') ? 'url' as const : 'postback' as const,
        })),
      })
      continue
    }

    if (reply.text) {
      outgoingMessages.push({ type: 'text', text: reply.text })
    }
  }

  if (!outgoingMessages.length && nlpResponse.text) {
    outgoingMessages.push({ type: 'text', text: nlpResponse.text })
  }

  return outgoingMessages
}
