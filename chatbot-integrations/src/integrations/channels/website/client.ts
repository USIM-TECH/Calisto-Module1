import { z } from 'zod'
import type { IncomingMessage, OutgoingMessage } from '../../../core/types.js'
import type { LeadOrchestrator } from '../../../app/lead-orchestrator.js'
import type { Logger } from '../../../core/utils/index.js'

const websiteChatRequestSchema = z.object({
  senderId: z.string().min(1).max(100).optional(),
  message: z.string().min(1).max(2000),
})

export interface WebsiteChatRequest {
  senderId?: string
  message: string
}

export interface WebsiteChatResponse {
  senderId: string
  leadId: string
  conversationId: string
  messages: OutgoingMessage[]
}

export class WebsiteChannel {
  private readonly _orchestrator: LeadOrchestrator
  private readonly _logger: Logger

  constructor(orchestrator: LeadOrchestrator, logger: Logger) {
    this._orchestrator = orchestrator
    this._logger = logger
  }

  public parseRequest(input: unknown): WebsiteChatRequest {
    return websiteChatRequestSchema.parse(input)
  }

  public async handleChat(input: WebsiteChatRequest): Promise<WebsiteChatResponse> {
    const senderId = (input.senderId?.trim() || `website-${Date.now()}`).slice(0, 100)
    const message = input.message.trim()
    const conversationId = senderId
    this._logger.debug(`[Website] Sending to orchestrator: sender="${senderId}", message="${message}"`)
    const incomingMessage: IncomingMessage = {
      channel: 'website',
      senderId,
      sourceId: senderId,
      conversationId,
      type: 'text',
      text: message,
      messageId: `web-${Date.now()}`,
      timestamp: new Date().toISOString(),
      rawPayload: input,
    }
    const result = await this._orchestrator.process(incomingMessage)
    const leadId = result?.lead.id ?? senderId

    return {
      senderId,
      leadId,
      conversationId,
      messages: result?.outgoingMessages ?? [],
    }
  }
}
