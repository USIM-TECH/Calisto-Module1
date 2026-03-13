import type { IncomingMessage, OutgoingMessage } from '../core/types.js'
import type { Logger } from '../core/utils/index.js'
import { NLPClient } from '../core/utils/index.js'
import type { MessageDeduplicator } from './message-deduplicator.js'

interface CreateNlpMessageHandlerProps {
  channelName: 'WhatsApp' | 'Instagram' | 'Messenger' | 'X' | 'Telegram'
  logger: Logger
  nlpClient: NLPClient
  sendText: (recipientId: string, text: string) => Promise<unknown>
  sendMessage?: (recipientId: string, message: OutgoingMessage) => Promise<unknown>
  deduplicator: MessageDeduplicator
}

function redactSenderId(senderId: string): string {
  if (senderId.length <= 4) {
    return senderId
  }

  return `${senderId.slice(0, 2)}...${senderId.slice(-2)}`
}

export function createNlpMessageHandler({
  channelName,
  logger,
  nlpClient,
  sendText,
  sendMessage,
  deduplicator,
}: CreateNlpMessageHandlerProps) {
  return async (message: IncomingMessage): Promise<void> => {
    const messageText = message.text || message.interactive?.title
    const senderLabel = redactSenderId(message.senderId)

    if (!deduplicator.shouldProcess(message)) {
      logger.warn(`[${channelName}] Ignoring duplicate message ${message.messageId} from ${senderLabel}`)
      return
    }

    if (!messageText) {
      logger.warn(`[${channelName}] Ignoring non-text message from ${senderLabel}`)
      return
    }

    try {
      const nlpResponse = await nlpClient.getResponse(message.senderId, messageText)
      logger.info(`[${channelName}] Reply generated for ${senderLabel}`)

      // Send each Rasa reply object individually so buttons are preserved
      for (const reply of nlpResponse.raw) {
        if (!reply.text) continue

        // If Rasa returned buttons and the channel supports rich messages, send as choice
        if (reply.buttons && reply.buttons.length > 0 && sendMessage) {
          const outgoing: OutgoingMessage = {
            type: 'choice',
            text: reply.text,
            options: reply.buttons.map((btn: { title: string; payload: string }) => ({
              label: btn.title,
              value: btn.payload,
            })),
          }
          logger.debug(`[${channelName}] Sending choice message with ${reply.buttons.length} buttons to ${senderLabel}`)
          await sendMessage(message.senderId, outgoing)
        } else {
          await sendText(message.senderId, reply.text)
        }
      }

      // Fallback if raw was empty but text exists
      if (nlpResponse.raw.length === 0 && nlpResponse.text) {
        await sendText(message.senderId, nlpResponse.text)
      }
    } catch (error: any) {
      logger.error(`[${channelName}] Failed to process message for ${senderLabel}: ${error.message}`)
      try {
        await sendText(message.senderId, 'Sorry, something went wrong. Please try again.')
      } catch (sendError: any) {
        logger.error(`[${channelName}] Failed to send fallback reply to ${senderLabel}: ${sendError.message}`)
      }
    }
  }
}
