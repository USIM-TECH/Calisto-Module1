import type { OutgoingMessage } from '../../../core/types.js'

function isPhonePrompt(text: string): boolean {
  const normalized = text.toLowerCase()
  return normalized.includes('phone number') || normalized.includes('reach you on')
}

export interface TelegramSendPayload {
  method: 'sendMessage' | 'sendPhoto'
  payload: Record<string, unknown>
}

function buildTelegramInlineKeyboard(actions: NonNullable<Extract<OutgoingMessage, { type: 'card' }>['actions']>) {
  return actions.map((action) => {
    if (action.type === 'url') {
      return [{ text: action.title, url: action.value }]
    }
    return [{ text: action.title, callback_data: action.value }]
  })
}

export function buildTelegramSendPayload(chatId: string, message: OutgoingMessage): TelegramSendPayload | undefined {
  switch (message.type) {
    case 'text':
      return {
        method: 'sendMessage',
        payload: isPhonePrompt(message.text)
          ? {
              chat_id: chatId,
              text: message.text,
              reply_markup: {
                keyboard: [[{ text: 'Share Contact', request_contact: true }]],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            }
          : {
              chat_id: chatId,
              text: message.text,
              reply_markup: {
                remove_keyboard: true,
              },
            },
      }
    case 'choice':
      return {
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: message.text,
          reply_markup: {
            inline_keyboard: message.options.map((option) => ([{
              text: option.label,
              callback_data: option.value,
            }])),
          },
        },
      }
    case 'location':
      return {
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: `https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}`,
        },
      }
    case 'card':
      if (message.imageUrl) {
        return {
          method: 'sendPhoto',
          payload: {
            chat_id: chatId,
            photo: message.imageUrl,
            caption: [
              `*${message.title}*`,
              message.subtitle,
            ].filter(Boolean).join('\n\n'),
            parse_mode: 'Markdown',
            ...(message.actions?.length
              ? {
                  reply_markup: {
                    inline_keyboard: buildTelegramInlineKeyboard(message.actions),
                  },
                }
              : {}),
          },
        }
      }
      return {
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: [
            `*${message.title}*`,
            message.subtitle,
          ].filter(Boolean).join('\n\n'),
          parse_mode: 'Markdown',
          ...(message.actions?.length
            ? {
                reply_markup: {
                  inline_keyboard: buildTelegramInlineKeyboard(message.actions),
                },
              }
            : {}),
        },
      }
    default:
      return undefined
  }
}
