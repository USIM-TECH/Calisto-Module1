import type { NLPResponse } from '../utils/index.js'
import type { ProductRecord } from '../../products/types.js'
import { toWirePayload } from '../../products/types.js'
import type { ChatReply } from './chat-service.js'

/**
 * Product card in the same `custom: { type: 'card' }` shape Rasa emits, so the
 * existing outgoing mapper and every channel's card renderer work unchanged.
 */
function productCard(product: ProductRecord, publicBaseUrl?: string): NonNullable<NLPResponse['raw'][number]['custom']> {
  const wire = toWirePayload(product, publicBaseUrl)
  const bookVisit: Record<string, string> = { service: 'Store Visit', brand: product.brand, product_type: product.productType }
  return {
    type: 'card',
    title: product.productName,
    subtitle: [`Price: RM${product.priceMyr.toFixed(2)}`, `Brand: ${product.brand}`, `Category: ${product.productType}`].join('\n'),
    imageUrl: wire.imageUrl ?? wire.fallback_image_url ?? undefined,
    actions: [
      { type: 'postback', title: 'Book Visit', value: `/book_appointment${JSON.stringify(bookVisit)}` },
    ],
  }
}

/** Wraps a chat reply as an NLPResponse so the orchestrator's normal reply path handles it. */
export function chatReplyToNlpResponse(reply: ChatReply, publicBaseUrl?: string): NLPResponse {
  return {
    text: reply.text,
    raw: [
      { text: reply.text },
      ...reply.products.map((product) => ({ custom: productCard(product, publicBaseUrl) })),
    ],
  }
}
