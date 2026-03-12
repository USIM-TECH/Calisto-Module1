import type { OutgoingMessage } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'

export async function sendMessengerMessage(
  recipientId: string,
  message: OutgoingMessage,
  logger: Logger,
  sendViaApi: (recipientId: string, message: any) => Promise<string>
): Promise<string | undefined> {
  switch (message.type) {
    case 'text':
      return sendViaApi(recipientId, { text: message.text })
    case 'image':
      return sendViaApi(recipientId, {
        attachment: { type: 'image', payload: { url: message.imageUrl, is_reusable: true } },
      })
    case 'audio':
      return sendViaApi(recipientId, {
        attachment: { type: 'audio', payload: { url: message.audioUrl, is_reusable: true } },
      })
    case 'video':
      return sendViaApi(recipientId, {
        attachment: { type: 'video', payload: { url: message.videoUrl, is_reusable: true } },
      })
    case 'file':
      return sendViaApi(recipientId, {
        attachment: { type: 'file', payload: { url: message.fileUrl, is_reusable: true } },
      })
    case 'location':
      return sendViaApi(
        recipientId,
        { text: `https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}` }
      )
    case 'choice':
      return sendViaApi(recipientId, buildMessengerChoiceMessage(message))
    default:
      logger.warn(`Unsupported outgoing message type for Messenger: ${(message as any).type}`)
      return undefined
  }
}

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
