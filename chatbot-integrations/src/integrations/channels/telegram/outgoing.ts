import type { OutgoingMessage } from '../../../core/types.js'

export function buildTelegramSendPayload(chatId: string, message: OutgoingMessage): Record<string, unknown> | undefined {
  switch (message.type) {
    case 'text':
      return { chat_id: chatId, text: message.text }
    case 'choice':
      return {
        chat_id: chatId,
        text: message.text,
        reply_markup: {
          inline_keyboard: message.options.map((option) => ([{
            text: option.label,
            callback_data: option.value,
          }])),
        },
      }
    case 'location':
      return {
        chat_id: chatId,
        text: `https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}`,
      }
    default:
      return undefined
  }
}
