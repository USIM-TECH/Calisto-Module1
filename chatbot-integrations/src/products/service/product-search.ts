import type { ProductStore } from '../storage/product-store.interface.js'
import type { ProductRecord, ProductSearchQuery } from '../types.js'

const SHOW_ALL = new Set(['show all brands', 'all brands', 'any', 'any brand'])

interface BudgetWindow {
  min?: number
  max?: number
}

/**
 * Mirror of `filter_by_budget` in `calisto_nlp_export/actions/actions.py`.
 * Budget is applied as a HARD filter before ranking.
 */
function resolveBudget(query: ProductSearchQuery): BudgetWindow {
  let { budgetMin, budgetMax } = query
  const bucket = query.budgetBucket?.toLowerCase()

  if (budgetMin === undefined && budgetMax === undefined && query.priceRange) {
    const text = query.priceRange.toLowerCase().replace(/\s+/g, '').replace(/–/g, '-')
    if (text.includes('underrm100') || text.includes('belowrm100')) {
      budgetMax = 100
    } else if (text.includes('rm100-rm250') || text.includes('rm100rm250')) {
      budgetMin = 100
      budgetMax = 250
    } else if (text.includes('rm250-rm300') || text.includes('rm250rm300')) {
      budgetMin = 250
      budgetMax = 300
    } else if (text.includes('aboverm300')) {
      budgetMin = 300
    } else {
      const parsed = parseBudgetFromText(query.priceRange)
      if (parsed) {
        budgetMin ??= parsed.min
        budgetMax ??= parsed.max
      }
    }
  }

  if (bucket === 'low') {
    budgetMax = budgetMax !== undefined ? Math.min(budgetMax, 150) : 150
  } else if (bucket === 'premium') {
    budgetMin = budgetMin !== undefined ? Math.max(budgetMin, 400) : 400
  }

  return { min: budgetMin, max: budgetMax }
}

function parseBudgetFromText(value: string): BudgetWindow | undefined {
  const text = value.toLowerCase().replace(/rm/g, '').replace(/myr/g, '').replace(/,/g, '')
  const range = /([0-9]+)\s*-\s*([0-9]+)/.exec(text)
  if (range) {
    const min = Number(range[1])
    const max = Number(range[2])
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max }
  }
  const under = /(?:under|below|less than|<=?)\s*([0-9]+)/.exec(text)
  if (under) {
    const max = Number(under[1])
    if (Number.isFinite(max)) return { max }
  }
  const above = /(?:above|over|more than|>=?)\s*([0-9]+)/.exec(text)
  if (above) {
    const min = Number(above[1])
    if (Number.isFinite(min)) return { min }
  }
  return undefined
}

function ciIncludes(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function ciEquals(value: string | null | undefined, target: string): boolean {
  if (!value) return false
  return value.toLowerCase() === target.toLowerCase()
}

function yesNoMatches(value: string | null | undefined, target: string | boolean): boolean {
  const expected = typeof target === 'boolean'
    ? (target ? 'yes' : 'no')
    : target.trim().toLowerCase()
  if (!value || !expected) return false
  const actual = value.trim().toLowerCase()
  if (['true', '1', 'y'].includes(expected)) return ['yes', 'true', '1', 'y'].includes(actual)
  if (['false', '0', 'n'].includes(expected)) return ['no', 'false', '0', 'n'].includes(actual)
  return actual === expected
}

function lensFeatureMatches(value: string | null | undefined, target: string): boolean {
  const normalized = target.trim().toLowerCase()
  if (!normalized) return true
  if (normalized.includes('blue light')) return ciIncludes(value, 'blue light')
  return ciIncludes(value, target)
}

/**
 * Score products like `rank_products_safely` does in actions.py:
 *   product_type substring match -> +4 (productType) / +2 (category)
 *   brand substring -> +3
 *   use_case match in description/name/lensFeature -> +2
 *   stock in_stock -> +2, low_stock -> +1
 *   rating contribution: rating/5
 * Tiebreak: price ascending.
 */
function scoreProduct(p: ProductRecord, q: ProductSearchQuery): number {
  let score = 0

  // 1. Exact brand match > fuzzy brand match
  if (q.brand) {
    const qBrand = q.brand.trim().toLowerCase()
    const pBrand = (p.brand || '').trim().toLowerCase()
    if (pBrand === qBrand) {
      score += 1000000
    } else if (pBrand.includes(qBrand) || qBrand.includes(pBrand)) {
      score += 500000
    }
  }

  // 2. Exact product type match > fuzzy product type match
  if (q.productType) {
    const qPt = q.productType.trim().toLowerCase()
    const pPt = (p.productType || '').trim().toLowerCase()
    const pCat = (p.category || '').trim().toLowerCase()
    if (pPt === qPt) {
      score += 100000
    } else if (pPt.includes(qPt) || qPt.includes(pPt) || pCat.includes(qPt)) {
      score += 50000
    }
  }

  // 3. Color match
  if (q.frameColor) {
    const colorStr = q.frameColor.trim().toLowerCase()
    const pColor = (p.frameColor || '').trim().toLowerCase()
    const pLensColor = (p.lensColor || '').trim().toLowerCase()
    if (pColor === colorStr || pLensColor === colorStr) {
      score += 10000
    }
  }
  if (q.lensColor) {
    const colorStr = q.lensColor.trim().toLowerCase()
    const pColor = (p.frameColor || '').trim().toLowerCase()
    const pLensColor = (p.lensColor || '').trim().toLowerCase()
    if (pColor === colorStr || pLensColor === colorStr) {
      score += 10000
    }
  }

  // 4. Lens type match
  if (q.lensType) {
    const ltStr = q.lensType.trim().toLowerCase()
    const pLt = (p.lensType || '').trim().toLowerCase()
    if (pLt.includes(ltStr)) {
      score += 1000
    }
  }

  // 5. Shape match
  if (q.frameShape) {
    const shapeStr = q.frameShape.trim().toLowerCase()
    const pShape = (p.frameShape || '').trim().toLowerCase()
    if (pShape === shapeStr) {
      score += 100
    }
  }

  // 6. Price modifier / budget match
  const pmStr = (q.priceModifier || '').trim().toLowerCase()
  if (pmStr) {
    if (p.priceMyr) {
      if (pmStr === 'cheaper' || pmStr === 'budget' || pmStr === 'affordable') {
        score += Math.max(0, 10 - p.priceMyr / 100)
      } else if (pmStr === 'expensive' || pmStr === 'premium' || pmStr === 'luxury') {
        score += Math.min(10, p.priceMyr / 100)
      }
    } else {
      score += 10
    }
  }

  if (q.useCase) {
    if (
      ciIncludes(p.description, q.useCase) ||
      ciIncludes(p.productName, q.useCase) ||
      ciIncludes(p.lensFeature, q.useCase)
    ) {
      score += 5
    }
  }

  const stock = (p.stockStatus ?? '').toLowerCase()
  if (stock === 'in_stock') score += 2
  else if (stock === 'low_stock') score += 1

  if (typeof p.rating === 'number') {
    score += p.rating / 5
  }

  return score
}

export class ProductSearchService {
  constructor(private readonly _store: ProductStore) {}

  async search(query: ProductSearchQuery): Promise<ProductRecord[]> {
    const all = await this._store.listAll()
    const wantsAllBrands = query.brand ? SHOW_ALL.has(query.brand.trim().toLowerCase()) : false

    const filtered = all.filter((p) => {
      if (query.uvProtection && !yesNoMatches(p.uvProtection, query.uvProtection)) return false
      if (query.polarized && !yesNoMatches(p.polarized, query.polarized)) return false
      if (query.multifocal !== undefined && !yesNoMatches(p.multifocal, query.multifocal)) return false
      if (query.lensColor && !ciIncludes(p.lensColor, query.lensColor)) return false
      if (query.lensType && !ciIncludes(p.lensType, query.lensType)) return false
      if (query.lensFeature && !lensFeatureMatches(p.lensFeature, query.lensFeature)) return false
      if (query.lensDuration && !ciIncludes(p.lensDuration, query.lensDuration)) return false
      if (query.productType && !ciEquals(p.productType, query.productType)) return false
      if (query.brand && !wantsAllBrands && !ciEquals(p.brand, query.brand)) return false
      if (query.frameColor && !ciEquals(p.frameColor, query.frameColor)) return false
      if (query.frameShape && !ciEquals(p.frameShape, query.frameShape)) return false
      if (query.frameMaterial && !ciEquals(p.frameMaterial, query.frameMaterial)) return false
      return true
    })

    const window = resolveBudget(query)
    const budgetFiltered = filtered.filter((p) => {
      if (window.min !== undefined && p.priceMyr <= window.min) return false
      if (window.max !== undefined && p.priceMyr > window.max) return false
      return true
    })

    const scored = budgetFiltered.map((p) => ({ p, s: scoreProduct(p, query) }))
    scored.sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s
      const pmStr = (query.priceModifier || '').trim().toLowerCase()
      if (pmStr === 'expensive' || pmStr === 'premium' || pmStr === 'luxury') {
        return b.p.priceMyr - a.p.priceMyr
      }
      return a.p.priceMyr - b.p.priceMyr
    })

    const limit = query.limit ?? 4
    return scored.slice(0, limit).map((entry) => entry.p)
  }
}
