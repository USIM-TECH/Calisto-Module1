import type { OutgoingMessage } from '../../../core/types.js'
import type { TextMessageWithQuickReplies } from './types.js'

export function buildInstagramChoiceMessage(message: Extract<OutgoingMessage, { type: 'choice' }>): TextMessageWithQuickReplies {
  if (!message.options.length) {
    return { text: message.text }
  }

  if (message.options.length > 13) {
    return { text: `${message.text}\n\n${message.options.map((option) => `- ${option.label}`).join('\n')}` }
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
