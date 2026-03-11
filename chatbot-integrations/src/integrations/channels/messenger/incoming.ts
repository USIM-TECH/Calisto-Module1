import type { IncomingMessage } from '../../../core/types.js'
import type {
  MessengerMessagingItemMessage,
  MessengerMessagingItemPostback,
} from './types.js'

export function normalizeMessengerMessagingItem(item: any): IncomingMessage {
  const incoming: IncomingMessage = {
    channel: 'messenger',
    senderId: item.sender.id,
    conversationId: item.sender.id,
    messageId: '',
    timestamp: String(item.timestamp),
    type: 'unknown',
    rawPayload: item,
  }

  if ('message' in item) {
    const msg = item as MessengerMessagingItemMessage
    incoming.messageId = msg.message.mid

    if (msg.message.quick_reply) {
      incoming.type = 'interactive'
      incoming.interactive = {
        type: 'button',
        id: msg.message.quick_reply.payload,
        title: msg.message.text ?? '',
      }
      incoming.text = msg.message.text
    } else if (msg.message.text) {
      incoming.type = 'text'
      incoming.text = msg.message.text
    } else if (msg.message.attachments?.length) {
      const attachment = msg.message.attachments[0]!
      const typeMap: Record<string, IncomingMessage['type']> = {
        image: 'image',
        audio: 'audio',
        video: 'video',
        file: 'file',
      }
      incoming.type = typeMap[attachment.type] ?? 'unknown'
      incoming.mediaUrl = attachment.payload.url
    }
  } else if ('postback' in item) {
    const pb = item as MessengerMessagingItemPostback
    incoming.messageId = pb.postback.mid
    incoming.type = 'interactive'
    incoming.text = pb.postback.title
    incoming.interactive = {
      type: 'button',
      id: pb.postback.payload,
      title: pb.postback.title,
    }
  }

  return incoming
}
