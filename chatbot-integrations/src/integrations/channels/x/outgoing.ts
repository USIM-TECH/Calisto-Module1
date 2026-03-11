import type { OutgoingMessage } from '../../../core/types.js'

export function normalizeXOutgoingText(message: OutgoingMessage): string | undefined {
  switch (message.type) {
    case 'text':
      return message.text
    case 'choice':
      return [
        message.text,
        '',
        ...message.options.map((option, index) => `${index + 1}. ${option.label}`),
      ].join('\n')
    case 'location':
      return `https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}`
    default:
      return undefined
  }
}
