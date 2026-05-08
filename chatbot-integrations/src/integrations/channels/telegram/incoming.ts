import type { IncomingMessage } from '../../../core/types.js'
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from './types.js'

function displayName(from?: TelegramMessage['from']): string | undefined {
  if (!from) {
    return undefined
  }
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username
}

export function normalizeTelegramUpdate(
  update: TelegramUpdate,
  resolveCallbackData: (value: string) => string = (value) => value,
): IncomingMessage | undefined {
  const message = update.message ?? update.edited_message
  if (message) {
    const contactName = message.contact
      ? [message.contact.first_name, message.contact.last_name].filter(Boolean).join(' ')
      : undefined
    const incoming: IncomingMessage = {
      channel: 'telegram',
      senderId: String(message.from?.id ?? message.chat.id),
      conversationId: String(message.chat.id),
      senderName: displayName(message.from) ?? contactName,
      messageId: String(message.message_id),
      timestamp: String(message.date),
      type: 'unknown',
      rawPayload: update,
    }

    if (message.text) {
      incoming.type = 'text'
      incoming.text = message.text
    } else if (message.contact) {
      incoming.type = 'unknown'
    } else if (message.location) {
      incoming.type = 'location'
      incoming.location = {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
      }
    }

    return incoming
  }

  const callback = update.callback_query
  if (callback?.message) {
    return normalizeTelegramCallbackQuery(callback, update, resolveCallbackData)
  }

  return undefined
}

function normalizeTelegramCallbackQuery(
  callback: TelegramCallbackQuery,
  rawPayload: TelegramUpdate,
  resolveCallbackData: (value: string) => string,
): IncomingMessage {
  const rawData = callback.data ?? callback.id
  const resolvedData = resolveCallbackData(rawData)
  return {
    channel: 'telegram',
    senderId: String(callback.from.id),
    conversationId: String(callback.message!.chat.id),
    senderName: displayName(callback.from),
    messageId: callback.id,
    timestamp: String(callback.message!.date),
    type: 'interactive',
    text: resolvedData,
    interactive: {
      type: 'button',
      id: resolvedData,
      title: resolvedData,
    },
    rawPayload,
  }
}
