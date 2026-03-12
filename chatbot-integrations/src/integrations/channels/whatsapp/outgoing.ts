import { Audio, Document, Image, Interactive, Location, Text, Video } from 'whatsapp-api-js/messages'
import type { WhatsAppAPI } from 'whatsapp-api-js'
import type { OutgoingMessage } from '../../../core/types.js'
import { sleep, type Logger } from '../../../core/utils/index.js'
import { convertMarkdownToWhatsApp, splitTextMessageIfNeeded } from './formatting.js'
import type { WhatsAppConfig } from './client.js'

const PART_DELAY_MS = 1000

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
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) await sleep(PART_DELAY_MS)
        const response = await client.sendMessage(
          config.phoneNumberId,
          recipientPhone,
          new Text(chunks[i]!)
        )
        lastId = (response as any)?.messages?.[0]?.id
      }
      return lastId
    }
    case 'image': {
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Image(message.imageUrl, false)
      )
      return (response as any)?.messages?.[0]?.id
    }
    case 'audio': {
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Audio(message.audioUrl, false)
      )
      return (response as any)?.messages?.[0]?.id
    }
    case 'video': {
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Video(message.videoUrl, false)
      )
      return (response as any)?.messages?.[0]?.id
    }
    case 'file': {
      const filename = message.filename ?? message.title ?? 'file'
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Document(message.fileUrl, false, message.title, filename)
      )
      return (response as any)?.messages?.[0]?.id
    }
    case 'location': {
      const response = await client.sendMessage(
        config.phoneNumberId,
        recipientPhone,
        new Location(message.longitude, message.latitude, message.name, message.address)
      )
      return (response as any)?.messages?.[0]?.id
    }
    case 'choice': {
      if (message.options.length <= 3) {
        const buttons = message.options.map((opt) => ({
          type: 'reply' as const,
          reply: { id: opt.value, title: opt.label.substring(0, 20) },
        }))
        const interactive = new Interactive(
          {
            type: 'button',
            body: { text: message.text },
            action: { buttons },
          } as any
        )
        const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
        return (response as any)?.messages?.[0]?.id
      }

      const rows = message.options.map((opt) => ({
        id: opt.value,
        title: opt.label.substring(0, 24),
      }))
      const interactive = new Interactive(
        {
          type: 'list',
          body: { text: message.text },
          action: {
            button: 'Choose',
            sections: [{ title: 'Options', rows }],
          },
        } as any
      )
      const response = await client.sendMessage(config.phoneNumberId, recipientPhone, interactive)
      return (response as any)?.messages?.[0]?.id
    }
    default:
      logger.warn(`Unsupported outgoing message type: ${(message as any).type}`)
      return undefined
  }
}
