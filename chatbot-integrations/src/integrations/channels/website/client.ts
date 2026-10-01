import { z } from 'zod'
import type { IncomingMessage, OutgoingMessage } from '../../../core/types.js'
import type { LeadOrchestrator } from '../../../leads/index.js'
import type { Logger } from '../../../core/utils/index.js'
import { locationFromIp } from '../../../core/utils/geo-location.js'

const websiteChatRequestSchema = z.object({
  senderId: z.string().min(1).max(100).optional(),
  message: z.string().min(1).max(2000),
  // Optional visitor identity, e.g. from the admin session or a host site
  // whose user is logged in. The lead orchestrator reads these off rawPayload.
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(200).optional(),
})

export interface WebsiteChatRequest {
  senderId?: string
  message: string
  name?: string
  email?: string
}

export interface WebsiteChatResponse {
  senderId: string
  customerId: string
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

  public async handleChat(input: WebsiteChatRequest, context: { clientIp?: string } = {}): Promise<WebsiteChatResponse> {
    const senderId = (input.senderId?.trim() || `website-${Date.now()}`).slice(0, 100)
    const message = input.message.trim()
    const conversationId = senderId
    this._logger.debug(`[Website] Sending to orchestrator: sender="${senderId}", message="${message}"`)
    const incomingMessage: IncomingMessage = {
      channel: 'website',
      senderId,
      senderName: input.name,
      sourceId: senderId,
      conversationId,
      type: 'text',
      text: message,
      inferredLocation: locationFromIp(context.clientIp),
      messageId: `web-${Date.now()}`,
      timestamp: new Date().toISOString(),
      rawPayload: input,
    }
    const result = await this._orchestrator.process(incomingMessage)
    const customerId = result?.customer.id ?? senderId

    return {
      senderId,
      customerId,
      conversationId,
      messages: result?.outgoingMessages ?? [],
    }
  }
}
