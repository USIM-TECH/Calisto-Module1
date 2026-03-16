import type { OutgoingMessage } from '../core/types.js'
import type { NLPResponse } from '../core/utils/index.js'

export function mapNlpResponseToOutgoingMessages(nlpResponse: NLPResponse): OutgoingMessage[] {
  const outgoingMessages: OutgoingMessage[] = []

  for (const reply of nlpResponse.raw) {
    if (reply.image) {
      outgoingMessages.push({ type: 'image', imageUrl: reply.image })
    }

    if (reply.buttons && reply.buttons.length > 0 && reply.text) {
      outgoingMessages.push({
        type: 'choice',
        text: reply.text,
        options: reply.buttons.map((btn: { title: string; payload: string }) => ({
          label: btn.title,
          value: btn.payload,
        })),
      })
      continue
    }

    if (reply.text) {
      outgoingMessages.push({ type: 'text', text: reply.text })
    }
  }

  if (!outgoingMessages.length && nlpResponse.text) {
    outgoingMessages.push({ type: 'text', text: nlpResponse.text })
  }

  return outgoingMessages
}
