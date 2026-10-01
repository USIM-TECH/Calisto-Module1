import {
  ActionButtons,
  ActionCTA,
  ActionList,
  Audio,
  Body,
  Button,
  Document,
  Header,
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

function splitCardActions(actions: NonNullable<Extract<OutgoingMessage, { type: 'card' }>['actions']>) {
  return {
    urlActions: actions.filter((action) => action.type === 'url'),
    postbackActions: actions.filter((action) => action.type === 'postback'),
  }
}

// Card links are sent as tap-to-open CTA URL buttons instead of pasted URLs,
// so the card text itself only carries the title and subtitle.
function formatCardAsText(message: Extract<OutgoingMessage, { type: 'card' }>): string {
  // `**…**` is Markdown bold; convertMarkdownToWhatsApp turns it into WhatsApp's *bold*.
  const lines = [`**${message.title}**`]
  if (message.subtitle) {
    lines.push('', message.subtitle)
  }
  return lines.join('\n')
}

type CardUrlAction = ReturnType<typeof splitCardActions>['urlActions'][number]

// WhatsApp limits: CTA button text 20 chars, body 1024.
const CTA_BUTTON_MAX = 20
const BODY_MAX = 1024

function buildCtaMessage(action: CardUrlAction, body: string): Interactive {
  return new Interactive(
    new ActionCTA(action.title.substring(0, CTA_BUTTON_MAX), action.value),
    new Body(body.substring(0, BODY_MAX)),
  )
}

function extractMessageId(response: any): string | undefined {
  return response?.messages?.[0]?.id
}

// WhatsApp rejects an interactive message if any reply-button / list-row `id`
// repeats ("(#131009) Parameter value is not valid ... Duplicated row id"),
// which fails the ENTIRE message so the user sees no options to tap. The id we
// use is the option value (the Rasa payload), so duplicate values are
// functionally redundant — drop them, keeping the first occurrence.
function dedupeChoiceOptions(
  options: Extract<OutgoingMessage, { type: 'choice' }>['options'],
  logger: Logger,
  recipientPhone: string
): Extract<OutgoingMessage, { type: 'choice' }>['options'] {
  const seen = new Set<string>()
  const unique = options.filter((opt) => {
    if (seen.has(opt.value)) {
      return false
    }
    seen.add(opt.value)
    return true
  })
  if (unique.length !== options.length) {
    logger.warn(
      `[WhatsApp] Dropped ${options.length - unique.length} duplicate choice option(s) for ${recipientPhone} (WhatsApp requires unique button/row ids)`
    )
  }
  return unique
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
      const options = dedupeChoiceOptions(message.options, logger, recipientPhone)
      if (options.length <= 3) {
        // Use reply buttons for up to 3 options
        const buttons = options.map((opt) => new Button(opt.value, opt.label.substring(0, 20)))
        const buttonTuple = asNonEmptyTuple(buttons)
        if (!buttonTuple) {
          logger.warn(`[WhatsApp] Choice message for ${recipientPhone} had no button options`)
          return undefined
        }

        const interactive = new Interactive(new ActionButtons(...buttonTuple), new Body(message.text))
        logger.debug(`[WhatsApp] Sending choice message with ${buttons.length} buttons to ${recipientPhone}`)
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
        const messageId = extractMessageId(response)
        logger.debug(`[WhatsApp] Choice send response for ${recipientPhone}: ${JSON.stringify(response)}`)
        if (!messageId) {
          logger.warn(`[WhatsApp] Choice send returned no message id for ${recipientPhone}`)
        }
        return messageId
      }

      // For more than 3 options, use list format
      const rows = options.map((opt) => new Row(opt.value, opt.label.substring(0, 24)))
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
    case 'card': {
      let lastId: string | undefined
      const text = convertMarkdownToWhatsApp(formatCardAsText(message))
      const { urlActions, postbackActions } = splitCardActions(message.actions ?? [])
      const buttons = postbackActions.slice(0, 3).map((action) => new Button(action.value, action.title.substring(0, 20)))
      const buttonTuple = asNonEmptyTuple(buttons)
      // WhatsApp allows one URL button per message: the first link can ride on the
      // card itself when nothing else needs the message; the rest follow as their own.
      let pendingUrlActions = urlActions

      if (message.imageUrl && buttonTuple) {
        // Single interactive message: image header + product details body + buttons
        const bodyText = text.substring(0, BODY_MAX)
        const interactive = new Interactive(
          new ActionButtons(...buttonTuple),
          new Body(bodyText),
          new Header(new Image(message.imageUrl, false))
        )
        logger.debug(`[WhatsApp] Sending card as single interactive message to ${recipientPhone}`)
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
        lastId = extractMessageId(response)
        logger.debug(`[WhatsApp] Card interactive send response for ${recipientPhone}: ${JSON.stringify(response)}`)
        if (!lastId) logger.warn(`[WhatsApp] Card interactive send returned no message id for ${recipientPhone}`)
      } else if (message.imageUrl) {
        // Image with caption, no buttons
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, new Image(message.imageUrl, false, text))
        lastId = extractMessageId(response)
        if (!lastId) logger.warn(`[WhatsApp] Card image send returned no message id for ${recipientPhone}`)
      } else if (buttonTuple) {
        // No image: text body + buttons
        const bodyText = text.substring(0, BODY_MAX)
        const interactive = new Interactive(new ActionButtons(...buttonTuple), new Body(bodyText))
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
        lastId = extractMessageId(response)
        if (!lastId) logger.warn(`[WhatsApp] Card text+buttons send returned no message id for ${recipientPhone}`)
      } else if (urlActions[0]) {
        // Text + links only: the card text carries the first link as its button.
        logger.debug(`[WhatsApp] Sending card with CTA URL button to ${recipientPhone}`)
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, buildCtaMessage(urlActions[0], text))
        lastId = extractMessageId(response)
        if (!lastId) logger.warn(`[WhatsApp] Card CTA send returned no message id for ${recipientPhone}`)
        pendingUrlActions = urlActions.slice(1)
      } else {
        // Text only
        const chunks = splitTextMessageIfNeeded(text)
        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) await sleep(PART_DELAY_MS)
          const response = await client.sendMessage(config.phoneNumberId, recipientPhone, new Text(chunks[i]!))
          lastId = extractMessageId(response)
        }
      }

      for (const action of pendingUrlActions) {
        await sleep(PART_DELAY_MS)
        logger.debug(`[WhatsApp] Sending card link "${action.title}" as CTA URL button to ${recipientPhone}`)
        const response = await client.sendMessage(
          config.phoneNumberId,
          recipientPhone,
          // A CTA message must have body text; the card title is the least noisy choice.
          buildCtaMessage(action, message.title),
        )
        lastId = extractMessageId(response) ?? lastId
      }

      return lastId
    }
    default:
      logger.warn(`Unsupported outgoing message type: ${(message as any).type}`)
      return undefined
  }
}
