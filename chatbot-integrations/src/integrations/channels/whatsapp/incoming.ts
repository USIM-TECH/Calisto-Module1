import type { IncomingMessage } from '../../../core/types.js'
import type { WhatsAppMessage } from './types.js'

export async function normalizeWhatsAppIncomingMessage(
  message: WhatsAppMessage,
  value: any,
  getMediaUrl: (mediaId: string) => Promise<string>
): Promise<IncomingMessage> {
  const contact = value.contacts?.[0]
  const senderName = contact?.profile?.name

  const incoming: IncomingMessage = {
    channel: 'whatsapp',
    senderId: message.from,
    conversationId: message.from,
    senderName,
    messageId: message.id,
    timestamp: message.timestamp,
    type: 'unknown',
    rawPayload: message,
  }

  switch (message.type) {
    case 'text':
      incoming.type = 'text'
      incoming.text = (message as any).text.body
      break
    case 'image':
      incoming.type = 'image'
      incoming.mimeType = (message as any).image.mime_type
      try { incoming.mediaUrl = await getMediaUrl((message as any).image.id) } catch {}
      break
    case 'audio':
      incoming.type = 'audio'
      incoming.mimeType = (message as any).audio.mime_type
      try { incoming.mediaUrl = await getMediaUrl((message as any).audio.id) } catch {}
      break
    case 'video':
      incoming.type = 'video'
      incoming.mimeType = (message as any).video.mime_type
      try { incoming.mediaUrl = await getMediaUrl((message as any).video.id) } catch {}
      break
    case 'document':
      incoming.type = 'file'
      incoming.mimeType = (message as any).document.mime_type
      try { incoming.mediaUrl = await getMediaUrl((message as any).document.id) } catch {}
      break
    case 'location':
      incoming.type = 'location'
      incoming.location = {
        latitude: (message as any).location.latitude,
        longitude: (message as any).location.longitude,
        address: (message as any).location.address,
        name: (message as any).location.name,
      }
      break
    case 'interactive': {
      incoming.type = 'interactive'
      const interactive = (message as any).interactive
      if (interactive.type === 'button_reply') {
        incoming.interactive = {
          type: 'button',
          id: interactive.button_reply.id,
          title: interactive.button_reply.title,
        }
        incoming.text = interactive.button_reply.title
      } else if (interactive.type === 'list_reply') {
        incoming.interactive = {
          type: 'list',
          id: interactive.list_reply.id,
          title: interactive.list_reply.title,
        }
        incoming.text = interactive.list_reply.title
      }
      break
    }
    case 'button':
      incoming.type = 'interactive'
      incoming.text = (message as any).button.text
      incoming.interactive = {
        type: 'button',
        id: (message as any).button.payload,
        title: (message as any).button.text,
      }
      break
    case 'reaction':
      incoming.type = 'reaction'
      break
    default:
      incoming.type = 'unknown'
  }

  return incoming
}
