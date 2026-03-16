import {
  ActionButtons,
  ActionList,
  Audio,
  Body,
  Button,
  Document,
  Image,
  Interactive,
  ListSection,
  Location,
  Row,
  Text,
  Video,
} from 'whatsapp-api-js/messages'
import type { WhatsAppAPI } from 'whatsapp-api-js'
import type { OutgoingMessage } from '../../../core/types.js'
import { sleep, type Logger } from '../../../core/utils/index.js'
import { convertMarkdownToWhatsApp, splitTextMessageIfNeeded } from './formatting.js'
import type { WhatsAppConfig } from './client.js'

const PART_DELAY_MS = 1000

function extractMessageId(response: any): string | undefined {
  return response?.messages?.[0]?.id
}

function asNonEmptyTuple<T>(items: T[]): [T, ...T[]] | undefined {
  const [first, ...rest] = items
  return first ? [first, ...rest] : undefined
}

export async function sendWhatsAppMessage(
  client: WhatsAppAPI,
  config: WhatsAppConfig,
  logger: Logger,
  recipientPhone: string,
  message: OutgoingMessage
): Promise<string | undefined> {
  switch (message.type) {
    case 'text': {
      const text = convertMarkdownToWhatsApp(message.text)
      const chunks = splitTextMessageIfNeeded(text)
      let lastId: string | undefined
      logger.debug(`[WhatsApp] Sending text reply to ${recipientPhone} in ${chunks.length} chunk(s)`)
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) await sleep(PART_DELAY_MS)
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, new Text(chunks[i]!))
        lastId = extractMessageId(response)
        logger.debug(`[WhatsApp] Text send response for ${recipientPhone}: ${JSON.stringify(response)}`)
        if (!lastId) {
          logger.warn(`[WhatsApp] Text send returned no message id for ${recipientPhone}`)
        }
      }
      return lastId
    }
    case 'image': {
      logger.debug(`[WhatsApp] Sending image reply to ${recipientPhone}`)
      const response = await client.sendMessage(config.phoneNumberId, recipientPhone, new Image(message.imageUrl, false))
      const messageId = extractMessageId(response)
      logger.debug(`[WhatsApp] Image send response for ${recipientPhone}: ${JSON.stringify(response)}`)
      if (!messageId) {
        logger.warn(`[WhatsApp] Image send returned no message id for ${recipientPhone}`)
      }
      return messageId
    }
    case 'audio': {
      logger.debug(`[WhatsApp] Sending audio reply to ${recipientPhone}`)
      const response = await client.sendMessage(config.phoneNumberId, recipientPhone, new Audio(message.audioUrl, false))
      const messageId = extractMessageId(response)
      logger.debug(`[WhatsApp] Audio send response for ${recipientPhone}: ${JSON.stringify(response)}`)
      if (!messageId) {
        logger.warn(`[WhatsApp] Audio send returned no message id for ${recipientPhone}`)
      }
      return messageId
    }
    case 'video': {
      logger.debug(`[WhatsApp] Sending video reply to ${recipientPhone}`)
      const response = await client.sendMessage(config.phoneNumberId, recipientPhone, new Video(message.videoUrl, false))
      const messageId = extractMessageId(response)
      logger.debug(`[WhatsApp] Video send response for ${recipientPhone}: ${JSON.stringify(response)}`)
      if (!messageId) {
        logger.warn(`[WhatsApp] Video send returned no message id for ${recipientPhone}`)
      }
      return messageId
    }
    case 'file': {
      const filename = message.filename ?? message.title ?? 'file'
      logger.debug(`[WhatsApp] Sending file reply to ${recipientPhone}`)
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Document(message.fileUrl, false, message.title, filename)
      )
      const messageId = extractMessageId(response)
      logger.debug(`[WhatsApp] File send response for ${recipientPhone}: ${JSON.stringify(response)}`)
      if (!messageId) {
        logger.warn(`[WhatsApp] File send returned no message id for ${recipientPhone}`)
      }
      return messageId
    }
    case 'location': {
      logger.debug(`[WhatsApp] Sending location reply to ${recipientPhone}`)
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Location(message.longitude, message.latitude, message.name, message.address)
      )
      const messageId = extractMessageId(response)
      logger.debug(`[WhatsApp] Location send response for ${recipientPhone}: ${JSON.stringify(response)}`)
      if (!messageId) {
        logger.warn(`[WhatsApp] Location send returned no message id for ${recipientPhone}`)
      }
      return messageId
    }
    case 'choice': {
      if (message.options.length <= 3) {
        const buttons = message.options.map((opt) => new Button(opt.value, opt.label.substring(0, 20)))
        const buttonTuple = asNonEmptyTuple(buttons)
        if (!buttonTuple) {
          logger.warn(`[WhatsApp] Choice message for ${recipientPhone} had no button options`)
          return undefined
        }

        const interactive = new Interactive(new ActionButtons(...buttonTuple), new Body(message.text))
        logger.debug(`[WhatsApp] Sending button reply to ${recipientPhone} with ${buttons.length} option(s)`)
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
        const messageId = extractMessageId(response)
        logger.debug(`[WhatsApp] Button send response for ${recipientPhone}: ${JSON.stringify(response)}`)
        if (!messageId) {
          logger.warn(`[WhatsApp] Button send returned no message id for ${recipientPhone}`)
        }
        return messageId
      }

      const rows = message.options.map((opt) => new Row(opt.value, opt.label.substring(0, 24)))
      const rowTuple = asNonEmptyTuple(rows)
      if (!rowTuple) {
        logger.warn(`[WhatsApp] Choice list for ${recipientPhone} had no rows`)
        return undefined
      }

      const interactive = new Interactive(
        new ActionList('Choose', new ListSection('Options', ...rowTuple)),
        new Body(message.text)
      )
      logger.debug(`[WhatsApp] Sending list reply to ${recipientPhone} with ${rows.length} row(s)`)
      const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
      const messageId = extractMessageId(response)
      logger.debug(`[WhatsApp] List send response for ${recipientPhone}: ${JSON.stringify(response)}`)
      if (!messageId) {
        logger.warn(`[WhatsApp] List send returned no message id for ${recipientPhone}`)
      }
      return messageId
    }
    default:
      logger.warn(`Unsupported outgoing message type: ${(message as any).type}`)
      return undefined
  }
}
