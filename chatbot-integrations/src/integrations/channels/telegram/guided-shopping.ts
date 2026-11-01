import { ProductSearchService } from '../../../products/service/product-search.js'
import { GuidedShoppingEngine, type GuidedShoppingCommand, type GuidedShoppingResponse } from '../../../core/guided-shopping/guided-shopping-engine.js'
import type { OutgoingMessage } from '../../../core/types.js'
import type { ProductStore } from '../../../products/storage/product-store.interface.js'

const PREFIX = 'tg:guide:'

function productCard(response: Extract<GuidedShoppingResponse, { type: 'card' }>): OutgoingMessage {
  const product = response.product
  const stock = product.stockStatus.toLowerCase().replace(/_/g, ' ')
  return {
    type: 'card',
    title: product.productName,
    imageUrl: product.imageUrl ?? product.fallbackImageUrl ?? undefined,
    subtitle: `RM${product.priceMyr.toFixed(2)} · Brand: ${product.brand} · ${product.category} · ${stock}`,
    actions: [{ type: 'postback', title: 'Book Visit', value: '/book_visit' }],
  }
}

function toTelegramMessage(response: GuidedShoppingResponse): OutgoingMessage {
  if (response.type === 'card') return productCard(response)
  return {
    type: 'choice',
    text: response.text,
    options: response.options.map((option) => ({
      label: option.label,
      value: `${PREFIX}${option.action.action}${option.action.value === undefined ? '' : `:${option.action.value}`}`,
    })),
  }
}

function parseCommand(text: string): GuidedShoppingCommand | undefined {
  if (text === '/start') return { action: 'start' }
  if (!text.startsWith(PREFIX)) return undefined
  const [action, ...parts] = text.slice(PREFIX.length).split(':')
  const value = parts.join(':')
  if (action === 'reset') return { action: 'reset' }
  if (action === 'category' || action === 'budget' || action === 'brand' || action === 'back') return { action, value }
  if (action === 'showMore') return { action: 'showMore' }
  return undefined
}

export class TelegramGuidedShopping {
  private readonly _engine: GuidedShoppingEngine

  constructor(products: ProductStore, private readonly _accountId: string = 'default') {
    this._engine = new GuidedShoppingEngine(products, new ProductSearchService(products))
  }

  public async handle(
    chatId: string,
    text: string | undefined,
    send: (message: OutgoingMessage) => Promise<unknown>,
    eventId?: string,
  ): Promise<boolean> {
    if (!text) return false
    const command = parseCommand(text)
    if (!command) return false
    const result = await this._engine.handle({ accountId: this._accountId, channel: 'telegram', conversationId: chatId }, { ...command, eventId })
    for (const response of result.responses) await send(toTelegramMessage(response))
    return result.handled
  }
}
