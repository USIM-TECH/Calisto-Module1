import { z } from 'zod'
import type { IncomingMessage, OutgoingMessage } from '../../../core/types.js'
import type { LeadOrchestrator } from '../../../leads/index.js'
import type { Logger } from '../../../core/utils/index.js'
import { locationFromIp } from '../../../core/utils/geo-location.js'
import { GuidedShoppingEngine, type GuidedShoppingCommand } from '../../../core/guided-shopping/guided-shopping-engine.js'

const websiteChatRequestSchema = z.object({
  senderId: z.string().min(1).max(100).optional(),
  message: z.string().min(1).max(2000),
  // Optional visitor identity, e.g. from the admin session or a host site
  // whose user is logged in. The lead orchestrator reads these off rawPayload.
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(200).optional(),
  guidedAction: z.object({
    action: z.enum(['start', 'reset', 'category', 'budget', 'brand', 'back', 'showMore']),
    value: z.string().max(200).optional(),
    eventId: z.string().min(1).max(100).optional(),
    stockRequired: z.boolean().optional(),
  }).optional(),
})

export interface WebsiteChatRequest {
  senderId?: string
  message: string
  name?: string
  email?: string
  guidedAction?: GuidedShoppingCommand
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

  constructor(orchestrator: LeadOrchestrator, logger: Logger, private readonly _guided?: GuidedShoppingEngine) {
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
    if (input.guidedAction) {
      if (!this._guided) {
        return { senderId, customerId: senderId, conversationId, messages: [{ type: 'text', text: 'Guided shopping is temporarily unavailable. Please try a typed request instead.' }] }
      }
      const guided = await this._guided.handle(
        { accountId: 'website', channel: 'website', conversationId },
        input.guidedAction,
      )
      return {
        senderId,
        customerId: senderId,
        conversationId,
        messages: guided.responses.map((response) => response.type === 'card'
          ? {
              type: 'card' as const,
              title: response.product.productName,
              imageUrl: response.product.imageUrl ?? response.product.fallbackImageUrl ?? undefined,
              subtitle: `RM${response.product.priceMyr.toFixed(2)} · Brand: ${response.product.brand} · ${response.product.category} · ${response.product.stockStatus.toLowerCase().replace(/_/g, ' ')}`,
              actions: [{ type: 'postback' as const, title: 'Book Visit', value: '/book_visit' }],
            }
          : {
              type: 'choice' as const,
              text: response.text,
              options: response.options.map((option) => ({
                label: option.label,
                value: `guided:${option.action.action}${option.action.value === undefined ? '' : `:${option.action.value}`}`,
              })),
            }),
      }
    }
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
