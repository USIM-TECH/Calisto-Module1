import type { IncomingMessage, OutgoingMessage } from '../core/types.js'
import type { Logger } from '../core/utils/index.js'
import { NLPClient } from '../core/utils/index.js'
import type { MessageDeduplicator } from './message-deduplicator.js'
import { mapNlpResponseToOutgoingMessages } from './rasa-outgoing.js'

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
      const outgoingMessages = mapNlpResponseToOutgoingMessages(nlpResponse)

      for (const outgoingMessage of outgoingMessages) {
        if (outgoingMessage.type === 'choice' && sendMessage) {
          logger.debug(`[${channelName}] Sending choice message with ${outgoingMessage.options.length} buttons to ${senderLabel}`)
          await sendMessage(message.senderId, outgoingMessage)
          continue
        }

        if (outgoingMessage.type === 'text') {
          await sendText(message.senderId, outgoingMessage.text)
          continue
        }

        if (sendMessage) {
          await sendMessage(message.senderId, outgoingMessage)
        }
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
