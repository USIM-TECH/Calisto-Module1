import type { IncomingMessage } from '../../../core/types.js'
import type { XDirectMessageEvent, XWebhookPayload } from './types.js'

export function normalizeXDirectMessageEvent(
  event: XDirectMessageEvent,
  payload: XWebhookPayload
): IncomingMessage | undefined {
  const senderId = event.message_create.sender_id
  const recipientId = event.message_create.target.recipient_id

  if (payload.for_user_id && senderId === payload.for_user_id) {
    return undefined
  }

  const sender = payload.users?.[senderId]

  return {
    channel: 'x',
    senderId,
    conversationId: recipientId,
    senderName: sender?.name ?? sender?.screen_name,
    username: sender?.screen_name,
    type: 'text',
    text: event.message_create.message_data.text,
    messageId: event.id,
    timestamp: event.created_timestamp,
    rawPayload: event,
  }
}
