import type { OutgoingMessage } from '../../../core/types.js'

export function buildMessengerChoiceMessage(message: Extract<OutgoingMessage, { type: 'choice' }>): any {
  if (!message.options.length) {
    return { text: message.text }
  }

  if (message.options.length > 13) {
    return {
      text: `${message.text}\n\n${message.options.map((option, index) => `${index + 1}. ${option.label}`).join('\n')}`,
    }
  }

  return {
    text: message.text,
    quick_replies: message.options.map((option) => ({
      content_type: 'text',
      title: option.label,
      payload: option.value,
    })),
  }
}
