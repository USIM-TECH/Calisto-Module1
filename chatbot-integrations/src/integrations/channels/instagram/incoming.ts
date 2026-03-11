import type { IncomingMessage } from '../../../core/types.js'
import type {
  InstagramMessagingItemMessage,
  InstagramMessagingItemPostback,
} from './types.js'

export function normalizeInstagramMessagingItem(item: any): IncomingMessage | undefined {
  const incoming: IncomingMessage = {
    channel: 'instagram',
    senderId: item.sender.id,
    conversationId: item.sender.id,
    messageId: '',
    timestamp: String(item.timestamp),
    type: 'unknown',
    rawPayload: item,
  }

  if ('message' in item) {
    const msg = item as InstagramMessagingItemMessage
    if (msg.message.is_echo) {
      return undefined
    }

    incoming.messageId = msg.message.mid

    if (msg.message.text) {
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

    if (msg.message.quick_reply) {
      incoming.type = 'interactive'
      incoming.interactive = {
        type: 'button',
        id: msg.message.quick_reply.payload,
        title: msg.message.text ?? '',
      }
      incoming.text = msg.message.text
    }

    return incoming
  }

  if ('postback' in item) {
    const pb = item as InstagramMessagingItemPostback
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
