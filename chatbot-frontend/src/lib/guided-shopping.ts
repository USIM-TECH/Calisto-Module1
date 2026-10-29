export interface GuidedCategory {
  label: string
  productType?: string
  description: string
  kind: 'category' | 'explore'
}

export interface BudgetOption {
  label: string
  minimum?: number
  maximum?: number
}

export const guidedCategories: GuidedCategory[] = [
  { label: 'Sunglasses', productType: 'Luxury Sunglasses', description: 'Protection with everyday polish', kind: 'category' },
  { label: 'Eyeglass Frames', productType: 'Designer Frames', description: 'Frames for your next look', kind: 'category' },
  { label: 'Contact Lenses', productType: 'Contact Lenses', description: 'Comfortable vision options', kind: 'category' },
  { label: 'Explore products', description: 'Browse what is available today', kind: 'explore' },
]

export const budgetOptions: BudgetOption[] = [
  { label: 'Under RM300', maximum: 300 },
  { label: 'RM300–RM600', minimum: 300, maximum: 600 },
  { label: 'RM600–RM1,000', minimum: 600, maximum: 1000 },
  { label: 'RM1,000+', minimum: 1000 },
  { label: 'Any budget' },
]

export interface GuidedSearchSelection {
  category: GuidedCategory
  budget: BudgetOption
  brand?: string
  inStock?: boolean
}

/** Produces an explicit ordinary chat request, keeping every filter visible to the customer. */
export function buildGuidedSearchRequest({ category, budget, brand, inStock }: GuidedSearchSelection): string {
  const filters = [
    category.productType,
    budget.minimum !== undefined && budget.maximum !== undefined
      ? `priced between RM${budget.minimum} and RM${budget.maximum}`
      : budget.maximum !== undefined
        ? `priced under RM${budget.maximum}`
        : budget.minimum !== undefined
          ? `priced from RM${budget.minimum}`
          : undefined,
    brand ? `by ${brand}` : undefined,
    inStock ? 'currently in stock' : undefined,
  ].filter((value): value is string => Boolean(value))

  return `Recommend three ${filters.join(', ')}. Show exact product names and prices.`
}

export function guidedSelectionLabel({ category, budget, brand, inStock }: GuidedSearchSelection): string {
  return [
    `Find ${category.label}`,
    budget.label === 'Any budget' ? undefined : budget.label,
    brand,
    inStock ? 'Available now' : undefined,
  ].filter((value): value is string => Boolean(value)).join(' · ')
}
