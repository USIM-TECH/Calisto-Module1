import { z } from 'zod'
import type { OutgoingMessage } from '../../../core/types.js'
import { type Logger, type NLPClient } from '../../../core/utils/index.js'
import { mapNlpResponseToOutgoingMessages } from '../../../app/rasa-outgoing.js'

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
  messages: OutgoingMessage[]
}

export class WebsiteChannel {
  private readonly _nlpClient: NLPClient
  private readonly _logger: Logger

  constructor(nlpClient: NLPClient, logger: Logger) {
    this._nlpClient = nlpClient
    this._logger = logger
  }

  public parseRequest(input: unknown): WebsiteChatRequest {
    return websiteChatRequestSchema.parse(input)
  }

  public async handleChat(input: WebsiteChatRequest): Promise<WebsiteChatResponse> {
    const senderId = (input.senderId?.trim() || `website-${Date.now()}`).slice(0, 100)
    const message = input.message.trim()

    this._logger.debug(`[Website] Sending to Rasa: sender="${senderId}", message="${message}"`)
    const nlpResponse = await this._nlpClient.getResponse(senderId, message)
    const messages = mapNlpResponseToOutgoingMessages(nlpResponse)

    return {
      senderId,
      messages,
    }
  }
}
