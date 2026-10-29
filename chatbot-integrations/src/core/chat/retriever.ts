import type { KnowledgeChunkStore } from '../../knowledge/index.js'
import type { PresetStore } from '../../products/storage/preset-store.interface.js'
import type { ProductSearchService } from '../../products/service/product-search.js'
import type { ProductRecord, ProductSearchQuery } from '../../products/types.js'

export interface RetrievedContext {
  /** False when the question was not about products, so "no products" must not be implied. */
  productsSearched: boolean
  products: ProductRecord[]
  knowledge: Array<{ source: string; text: string }>
}

export interface RetrieverConfig {
  maxProducts: number
  knowledgeChunks: number
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'is', 'are', 'do', 'does', 'you',
  'your', 'we', 'i', 'me', 'my', 'it', 'this', 'that', 'what', 'how', 'can', 'with', 'any', 'have',
  'has', 'be', 'at', 'by', 'from', 'about', 'please', 'there', 'get', 'want', 'need',
])

function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)))]
}

/**
 * Pulls the real catalogue rows and knowledge text the model is allowed to
 * talk about. Prices, stock and specs always come from here, never from the model.
 */
export class ChatRetriever {
  constructor(
    private readonly _products: ProductSearchService,
    private readonly _presets: PresetStore | undefined,
    private readonly _knowledge: KnowledgeChunkStore | undefined,
    private readonly _config: RetrieverConfig,
  ) {}

  /** Pass `null` filters to skip the product search (e.g. a store-policy question). */
  public async retrieve(question: string, filters: ProductSearchQuery | null): Promise<RetrievedContext> {
    const [products, knowledge] = await Promise.all([
      filters ? this._searchProducts(filters) : Promise.resolve([]),
      this._searchKnowledge(question),
    ])
    return { productsSearched: filters !== null, products, knowledge }
  }

  private async _searchProducts(filters: ProductSearchQuery): Promise<ProductRecord[]> {
    const max = Math.min(this._config.maxProducts, filters.limit ?? this._config.maxProducts)
    // "Cheaper"/"premium" asks are about price order, which the search only uses as a
    // tie-break, so pull a wide candidate set and order it by price ourselves.
    const byPrice = filters.priceModifier === 'cheap' ? 'asc'
      : filters.priceModifier === 'expensive' || filters.priceModifier === 'premium' ? 'desc'
      : undefined
    const found = await this._products.search({ ...filters, limit: byPrice ? 200 : max * 5 })
    const results = byPrice
      ? [...found].sort((a, b) => (byPrice === 'asc' ? a.priceMyr - b.priceMyr : b.priceMyr - a.priceMyr))
      : found

    // An active preset limits what we suggest, but only when it has a match;
    // otherwise fall back to the whole catalogue (same rule the Rasa flow uses).
    const active = await this._presets?.getActive()
    if (active?.presetId && active.productIds.length > 0) {
      const inPreset = new Set(active.productIds)
      const preferred = results.filter((p) => inPreset.has(p.productId))
      if (preferred.length > 0) return preferred.slice(0, max)
    }
    return results.slice(0, max)
  }

  private async _searchKnowledge(question: string): Promise<Array<{ source: string; text: string }>> {
    if (!this._knowledge || this._config.knowledgeChunks === 0) return []
    const words = keywords(question)
    if (words.length === 0) return []

    const chunks = await this._knowledge.listForRasa()
    return chunks
      .map((chunk) => {
        const haystack = chunk.text.toLowerCase()
        return { chunk, score: words.filter((w) => haystack.includes(w)).length }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this._config.knowledgeChunks)
      .map((entry) => entry.chunk)
  }
}
