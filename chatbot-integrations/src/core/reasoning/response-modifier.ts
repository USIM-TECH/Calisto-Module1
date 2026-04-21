import type { OutgoingMessage } from '../types.js'
import type { ReasoningEmotion } from './types.js'

function prependTone(text: string, toneLead: string): string {
  const trimmed = text.trim()
  if (!trimmed || trimmed.toLowerCase().startsWith(toneLead.toLowerCase())) {
    return text
  }

  return `${toneLead}\n\n${trimmed}`
}

function toneLeadForEmotion(emotion: ReasoningEmotion): string | undefined {
  switch (emotion) {
    case 'confused':
      return 'Let me keep this simple.'
    case 'frustrated':
      return 'I understand this is frustrating.'
    case 'hesitant':
      return 'No pressure.'
    case 'interested':
      return 'Here is the quickest next step.'
    case 'neutral':
    default:
      return undefined
  }
}

export function adaptMessagesForEmotion(
  messages: OutgoingMessage[],
  emotion: ReasoningEmotion,
  enabled: boolean,
): OutgoingMessage[] {
  if (!enabled || emotion === 'neutral') {
    return messages
  }

  const toneLead = toneLeadForEmotion(emotion)
  if (!toneLead) {
    return messages
  }

  let adaptedFirstMessage = false
  return messages.map((message) => {
    if (adaptedFirstMessage) {
      return message
    }

    if (message.type === 'text') {
      adaptedFirstMessage = true
      return {
        ...message,
        text: prependTone(message.text, toneLead),
      }
    }

    if (message.type === 'choice') {
      adaptedFirstMessage = true
      return {
        ...message,
        text: prependTone(message.text, toneLead),
      }
    }

    return message
  })
}
