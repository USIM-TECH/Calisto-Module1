import type { OutgoingMessage } from '../../../core/types.js'
import type { CallbackAliasStore } from './callback-alias.js'

const TELEGRAM_CALLBACK_LIMIT_BYTES = 64

async function telegramCallbackData(payload: string, aliasStore?: CallbackAliasStore): Promise<string> {
  const value = aliasStore ? await aliasStore.alias(payload) : payload
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

async function buildTelegramInlineKeyboard(
  actions: NonNullable<Extract<OutgoingMessage, { type: 'card' }>['actions']>,
  aliasStore?: CallbackAliasStore,
) {
  const rows = await Promise.all(actions.map(async (action) => {
    if (action.type === 'url') {
      return [{ text: action.title, url: action.value }]
    }
    return [{ text: action.title, callback_data: await telegramCallbackData(action.value, aliasStore) }]
  }))
  return rows
}

export async function buildTelegramSendPayload(
  chatId: string,
  message: OutgoingMessage,
  aliasStore?: CallbackAliasStore,
): Promise<TelegramSendPayload | undefined> {
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
    case 'choice': {
      const options = await Promise.all(message.options.map(async (option) => ([{
        text: option.label,
        callback_data: await telegramCallbackData(option.value, aliasStore),
      }])))
      return {
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: message.text,
          reply_markup: {
            inline_keyboard: options,
          },
        },
      }
    }
    case 'location':
      return {
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: `https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}`,
        },
      }
    case 'card': {
      const formatted = formatCardText(message)
      const inlineKeyboard = message.actions?.length
        ? await buildTelegramInlineKeyboard(message.actions, aliasStore)
        : undefined
      if (message.imageUrl) {
        return {
          method: 'sendPhoto',
          payload: {
            chat_id: chatId,
            photo: message.imageUrl,
            caption: formatted.text,
            ...(formatted.parseMode ? { parse_mode: formatted.parseMode } : {}),
            ...(inlineKeyboard
              ? {
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
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
          ...(inlineKeyboard
            ? {
                reply_markup: {
                  inline_keyboard: inlineKeyboard,
                },
              }
            : {}),
        },
      }
    }
    default:
      return undefined
  }
}
