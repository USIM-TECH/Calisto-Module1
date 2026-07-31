import type { OutgoingMessage } from '../../../core/types.js'
import type { Logger } from '../../../core/utils/index.js'
import type { InstagramRecipientId, TextMessageWithQuickReplies } from './types.js'

export async function sendInstagramMessage(
  recipientId: string,
  message: OutgoingMessage,
  logger: Logger,
  sendRawMessage: (
    recipient: InstagramRecipientId,
    message: any
  ) => Promise<{ recipient_id: string; message_id: string }>
): Promise<string | undefined> {
  switch (message.type) {
    case 'text': {
      const response = await sendRawMessage({ id: recipientId }, { text: message.text })
      return response.message_id
    }
    case 'image': {
      const response = await sendRawMessage({ id: recipientId }, {
        attachment: { type: 'image', payload: { url: message.imageUrl } },
      })
      return response.message_id
    }
    case 'audio': {
      const response = await sendRawMessage({ id: recipientId }, {
        attachment: { type: 'audio', payload: { url: message.audioUrl } },
      })
      return response.message_id
    }
    case 'video': {
      const response = await sendRawMessage({ id: recipientId }, {
        attachment: { type: 'video', payload: { url: message.videoUrl } },
      })
      return response.message_id
    }
    case 'file': {
      const response = await sendRawMessage({ id: recipientId }, {
        attachment: { type: 'file', payload: { url: message.fileUrl } },
      })
      return response.message_id
    }
    case 'location': {
      const response = await sendRawMessage(
        { id: recipientId },
        { text: `https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}` }
      )
      return response.message_id
    }
    case 'choice': {
      const response = await sendRawMessage({ id: recipientId }, buildInstagramChoiceMessage(message))
      return response.message_id
    }
    case 'card': {
      const response = await sendRawMessage({ id: recipientId }, buildInstagramCardMessage(message))
      return response.message_id
    }
    default:
      logger.warn(`Unsupported outgoing message type for Instagram: ${(message as any).type}`)
      return undefined
  }
}

function formatInstagramChoiceText(message: Extract<OutgoingMessage, { type: 'choice' }>): string {
  if (!message.options.length) {
    return message.text
  }

  const optionsText = message.options.map((option, index) => `${index + 1}. ${option.label}`).join('\n')
  return `${message.text}\n\nChoose an option:\n${optionsText}`
}

function normalizeCardToText(message: Extract<OutgoingMessage, { type: 'card' }>): string {
  return [
    message.title,
    message.subtitle,
    message.actions?.map((action) => `${action.title}: ${action.value}`).join('\n'),
  ].filter(Boolean).join('\n\n')
}

export function buildInstagramChoiceMessage(message: Extract<OutgoingMessage, { type: 'choice' }>): TextMessageWithQuickReplies {
  if (!message.options.length) {
    return { text: message.text }
  }

  if (message.options.length > 13) {
    return { text: formatInstagramChoiceText(message) }
  }

  return {
    text: formatInstagramChoiceText(message),
    quick_replies: message.options.map((option) => ({
      content_type: 'text',
      title: option.label,
      payload: option.value,
    })),
  }
}

function buildInstagramCardMessage(message: Extract<OutgoingMessage, { type: 'card' }>): any {
  const buttons = (message.actions ?? [])
    .slice(0, 3)
    .map((action) => {
      if (action.type === 'url') {
        return {
          type: 'web_url',
          title: action.title.substring(0, 20),
          url: action.value,
        }
      }

      return {
        type: 'postback',
        title: action.title.substring(0, 20),
        payload: action.value,
      }
    })

  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: [
          {
            title: message.title.substring(0, 80),
            image_url: message.imageUrl,
            subtitle: message.subtitle?.substring(0, 80),
            buttons,
          },
        ],
      },
    },
  }
}
