import type { OutgoingMessage } from '../../../core/types.js'
import type { TelegramCallbackAliasStore } from './callback-alias.js'

const TELEGRAM_CALLBACK_LIMIT_BYTES = 64

function telegramCallbackData(payload: string, aliasStore?: TelegramCallbackAliasStore): string {
  const value = aliasStore ? aliasStore.alias(payload) : payload
  if (Buffer.byteLength(value, 'utf8') > TELEGRAM_CALLBACK_LIMIT_BYTES) {
    throw new Error(`Telegram callback_data exceeds ${TELEGRAM_CALLBACK_LIMIT_BYTES} bytes after aliasing`)
  }
  return value
}

function hasMarkdownRisk(value: string): boolean {
  return /[*_[\]()`]/.test(value)
}

function formatCardText(message: Extract<OutgoingMessage, { type: 'card' }>): { text: string; parseMode?: 'Markdown' } {
  const parts = [message.title, message.subtitle].filter(Boolean) as string[]
  const text = parts.join('\n\n')
  if (parts.some(hasMarkdownRisk)) {
    return { text }
  }
  return {
    text: [`*${message.title}*`, message.subtitle].filter(Boolean).join('\n\n'),
    parseMode: 'Markdown',
  }
}

function isPhonePrompt(text: string): boolean {
  const normalized = text.toLowerCase()
  return normalized.includes('phone number') || normalized.includes('reach you on')
}

export interface TelegramSendPayload {
  method: 'sendMessage' | 'sendPhoto'
  payload: Record<string, unknown>
}

function buildTelegramInlineKeyboard(
  actions: NonNullable<Extract<OutgoingMessage, { type: 'card' }>['actions']>,
  aliasStore?: TelegramCallbackAliasStore,
) {
  return actions.map((action) => {
    if (action.type === 'url') {
      return [{ text: action.title, url: action.value }]
    }
    return [{ text: action.title, callback_data: telegramCallbackData(action.value, aliasStore) }]
  })
}

export function buildTelegramSendPayload(
  chatId: string,
  message: OutgoingMessage,
  aliasStore?: TelegramCallbackAliasStore,
): TelegramSendPayload | undefined {
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
              callback_data: telegramCallbackData(option.value, aliasStore),
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
      const formatted = formatCardText(message)
      if (message.imageUrl) {
        return {
          method: 'sendPhoto',
          payload: {
            chat_id: chatId,
            photo: message.imageUrl,
            caption: formatted.text,
            ...(formatted.parseMode ? { parse_mode: formatted.parseMode } : {}),
            ...(message.actions?.length
              ? {
                  reply_markup: {
                    inline_keyboard: buildTelegramInlineKeyboard(message.actions, aliasStore),
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
          text: formatted.text,
          ...(formatted.parseMode ? { parse_mode: formatted.parseMode } : {}),
          ...(message.actions?.length
            ? {
                reply_markup: {
                  inline_keyboard: buildTelegramInlineKeyboard(message.actions, aliasStore),
                },
              }
            : {}),
        },
      }
    default:
      return undefined
  }
}
