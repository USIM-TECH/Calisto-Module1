import type { ProductSearchService } from '../../products/service/product-search.js'
import type { ProductStore } from '../../products/storage/product-store.interface.js'
import type { ProductRecord } from '../../products/types.js'

export type GuidedShoppingScope = {
  accountId?: string
  channel: string
  conversationId: string
}

export type GuidedShoppingCommand = {
  action: 'start' | 'reset' | 'category' | 'budget' | 'brand' | 'back' | 'showMore'
  value?: string
  eventId?: string
  stockRequired?: boolean
}

export type GuidedShoppingChoice = { label: string; action: GuidedShoppingCommand }
export type GuidedShoppingResponse =
  | { type: 'choice'; text: string; options: GuidedShoppingChoice[] }
  | { type: 'card'; product: ProductRecord }

type GuidedState = {
  productType?: string
  budgetMin?: number
  budgetMax?: number
  brand?: string
  phase: 'category' | 'budget' | 'brand' | 'results'
  shownProductIds: string[]
  stockRequired: boolean
}

const CATEGORY_OPTIONS: GuidedShoppingChoice[] = [
  { label: 'Sunglasses', action: { action: 'category', value: 'Luxury Sunglasses' } },
  { label: 'Eyeglass Frames', action: { action: 'category', value: 'Designer Frames' } },
  { label: 'Contact Lenses', action: { action: 'category', value: 'Contact Lenses' } },
  { label: 'Explore All', action: { action: 'category', value: 'any' } },
]

const BUDGET_OPTIONS: GuidedShoppingChoice[] = [
  { label: 'Under RM500', action: { action: 'budget', value: 'under500' } },
  { label: 'RM500–RM800', action: { action: 'budget', value: '500-800' } },
  { label: 'Above RM800', action: { action: 'budget', value: 'above800' } },
  { label: 'Any Budget', action: { action: 'budget', value: 'any' } },
]

function scopeKey(scope: GuidedShoppingScope): string {
  return `${scope.accountId ?? 'default'}:${scope.channel}:${scope.conversationId}`
}

export class GuidedShoppingEngine {
  private readonly _states = new Map<string, GuidedState>()
  private readonly _seenEvents = new Set<string>()

  constructor(
    private readonly _products: ProductStore,
    private readonly _search: ProductSearchService,
  ) {}

  public async handle(scope: GuidedShoppingScope, command: GuidedShoppingCommand): Promise<{ handled: boolean; responses: GuidedShoppingResponse[] }> {
    const key = scopeKey(scope)
    if (command.eventId) {
      const eventKey = `${key}:${command.eventId}`
      if (this._seenEvents.has(eventKey)) return { handled: true, responses: [] }
      this._seenEvents.add(eventKey)
      if (this._seenEvents.size > 5000) this._seenEvents.delete(this._seenEvents.values().next().value!)
    }

    if (command.action === 'start' || command.action === 'reset') {
      this._states.set(key, { phase: 'category', shownProductIds: [], stockRequired: true })
      return { handled: true, responses: [{ type: 'choice', text: 'What would you like to browse?', options: CATEGORY_OPTIONS }] }
    }

    let state = this._states.get(key)
    if (!state && command.action === 'category') {
      state = { phase: 'category', shownProductIds: [], stockRequired: true }
      this._states.set(key, state)
    }
    if (!state) return { handled: true, responses: [] }

    if (command.action === 'back' && command.value === 'budget') {
      if (state.phase !== 'budget' && state.phase !== 'brand' && state.phase !== 'results') return { handled: true, responses: [] }
      delete state.budgetMin
      delete state.budgetMax
      delete state.brand
      state.phase = 'budget'
      state.shownProductIds = []
      return { handled: true, responses: [{ type: 'choice', text: 'Choose a budget:', options: BUDGET_OPTIONS }] }
    }

    if (command.action === 'category') {
      if (command.value && command.value !== 'any') state.productType = command.value
      else delete state.productType
      delete state.budgetMin
      delete state.budgetMax
      delete state.brand
      state.phase = 'budget'
      state.shownProductIds = []
      return { handled: true, responses: [{ type: 'choice', text: 'Choose a budget:', options: BUDGET_OPTIONS }] }
    }

    if (command.action === 'budget') {
      if (state.phase !== 'budget') return { handled: true, responses: [] }
      delete state.budgetMin
      delete state.budgetMax
      if (command.value === 'under500') state.budgetMax = 500
      else if (command.value === '500-800') { state.budgetMin = 500; state.budgetMax = 800 }
      else if (command.value === 'above800') state.budgetMin = 800
      else if (command.value?.startsWith('max:')) {
        const maximum = Number(command.value.slice(4))
        if (!Number.isFinite(maximum)) return { handled: true, responses: [] }
        state.budgetMax = maximum
      } else if (command.value?.startsWith('range:')) {
        const [minimum, maximum] = command.value.slice(6).split('-').map(Number)
        if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return { handled: true, responses: [] }
        state.budgetMin = minimum
        state.budgetMax = maximum
      } else if (command.value?.startsWith('min:')) {
        const minimum = Number(command.value.slice(4))
        if (!Number.isFinite(minimum)) return { handled: true, responses: [] }
        state.budgetMin = minimum
      } else if (command.value !== 'any') return { handled: true, responses: [] }
      state.phase = 'brand'
      const rows = await this._products.listAll()
      const brands = [...new Set(rows
        .filter((product) => !state.productType || product.productType === state.productType)
        .map((product) => product.brand).filter(Boolean))].sort()
      return {
        handled: true,
        responses: [{
          type: 'choice',
          text: 'Choose a brand or continue with any brand:',
          options: [
            ...brands.slice(0, 12).map((brand) => ({ label: brand, action: { action: 'brand' as const, value: brand } })),
            { label: 'Any Brand', action: { action: 'brand', value: 'any' } },
            { label: 'Back', action: { action: 'back', value: 'budget' } },
          ],
        }],
      }
    }

    if (command.action === 'brand') {
      if (state.phase !== 'brand' && state.phase !== 'results') return { handled: true, responses: [] }
      if (command.value === 'any') delete state.brand
      else if (command.value) {
        const rows = await this._products.listAll()
        const valid = new Set(rows.filter((product) => !state.productType || product.productType === state.productType).map((product) => product.brand))
        if (!valid.has(command.value)) return { handled: true, responses: [] }
        state.brand = command.value
      } else return { handled: true, responses: [] }
      state.phase = 'results'
      state.stockRequired = command.stockRequired ?? true
      state.shownProductIds = []
      return { handled: true, responses: await this._resultResponses(state) }
    }

    if (command.action === 'showMore') {
      if (state.phase !== 'results') return { handled: true, responses: [] }
      return { handled: true, responses: await this._resultResponses(state) }
    }

    return { handled: true, responses: [] }
  }

  private async _resultResponses(state: GuidedState): Promise<GuidedShoppingResponse[]> {
    const products = await this._search.search({
      productType: state.productType,
      brand: state.brand,
      budgetMin: state.budgetMin,
      budgetMax: state.budgetMax,
      stockRequired: state.stockRequired,
      excludeProductIds: state.shownProductIds,
      limit: 4,
    })
    if (products.length === 0) {
      return [{
        type: 'choice',
        text: 'No verified products matched those filters. What would you like to try?',
        options: [
          { label: 'Change Budget', action: { action: 'back', value: 'budget' } },
          { label: 'Any Brand', action: { action: 'brand', value: 'any' } },
          { label: 'Explore Categories', action: { action: 'reset' } },
          { label: 'Clear Filters', action: { action: 'reset' } },
        ],
      }]
    }
    state.shownProductIds.push(...products.map((product) => product.productId))
    return [
      ...products.map((product) => ({ type: 'card' as const, product })),
      { type: 'choice', text: 'What would you like to do next?', options: [
        { label: 'Show More', action: { action: 'showMore' } },
        { label: 'Explore Categories', action: { action: 'reset' } },
        { label: 'Clear Filters', action: { action: 'reset' } },
      ] },
    ]
  }
}
