import type { IncomingMessage, OutgoingMessage } from '../core/types.js'
import type { Logger } from '../core/utils/index.js'
import { invalidateLeadsCache, type CacheService } from '../cache/index.js'
import type { LeadOrchestrator } from '../leads/index.js'

interface CreateNlpMessageHandlerProps {
  channelName: 'WhatsApp' | 'Instagram' | 'Messenger' | 'X' | 'Telegram'
  logger: Logger
  orchestrator: LeadOrchestrator
  cacheService: CacheService
  sendText: (recipientId: string, text: string) => Promise<unknown>
  sendMessage?: (recipientId: string, message: OutgoingMessage) => Promise<unknown>
  getRecipientId?: (message: IncomingMessage) => string
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
  orchestrator,
  cacheService,
  sendText,
  sendMessage,
  getRecipientId,
}: CreateNlpMessageHandlerProps) {
  return async (message: IncomingMessage): Promise<void> => {
    const senderLabel = redactSenderId(message.senderId)
    const recipientId = getRecipientId ? getRecipientId(message) : message.senderId

    try {
      const result = await orchestrator.process(message)
      if (!result) {
        return
      }

      await invalidateLeadsCache(cacheService)

      logger.info(`[${channelName}] Reply generated for ${senderLabel}`)
      const outgoingMessages = result.outgoingMessages

      for (const outgoingMessage of outgoingMessages) {
        if (outgoingMessage.type === 'choice' && sendMessage) {
          logger.debug(`[${channelName}] Sending choice message with ${outgoingMessage.options.length} buttons to ${senderLabel}`)
          await sendMessage(recipientId, outgoingMessage)
          continue
        }

        if (outgoingMessage.type === 'text') {
          await sendText(recipientId, outgoingMessage.text)
          continue
        }

        if (sendMessage) {
          await sendMessage(recipientId, outgoingMessage)
        }
      }
    } catch (error: any) {
      logger.error(`[${channelName}] Failed to process message for ${senderLabel}: ${error.message}`)
      try {
        await sendText(recipientId, 'Sorry, something went wrong. Please try again.')
      } catch (sendError: any) {
        logger.error(`[${channelName}] Failed to send fallback reply to ${senderLabel}: ${sendError.message}`)
      }
    }
  }
}
