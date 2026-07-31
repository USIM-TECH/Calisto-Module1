export interface ProductRecord {
  productId: string
  productName: string
  category: string
  productType: string
  brand: string
  priceMyr: number
  description?: string | null
  frameMaterial?: string | null
  frameShape?: string | null
  frameColor?: string | null
  gender?: string | null
  uvProtection?: string | null
  polarized?: string | null
  lensColor?: string | null
  frameStyle?: string | null
  lensType?: string | null
  lensFeature?: string | null
  lensDuration?: string | null
  multifocal?: string | null
  storeLocation?: string | null
  city?: string | null
  stockStatus: string
  rating?: number | null
  bestseller: boolean
  newArrival: boolean
  imageUrl?: string | null
  fallbackImageUrl?: string | null
  createdAt: string
  updatedAt: string
}

export type ProductInput = Omit<ProductRecord, 'createdAt' | 'updatedAt'>

export type ProductUpdate = Partial<Omit<ProductRecord, 'productId' | 'createdAt' | 'updatedAt'>>

export interface ProductListQuery {
  q?: string
  productType?: string
  brand?: string
  page?: number
  limit?: number
}

export interface ProductListResult {
  items: ProductRecord[]
  total: number
  page: number
  limit: number
}

export interface ProductSearchQuery {
  productType?: string
  brand?: string
  priceRange?: string
  frameColor?: string
  frameShape?: string
  frameMaterial?: string
  uvProtection?: string
  polarized?: string
  lensColor?: string
  lensType?: string
  lensFeature?: string
  lensDuration?: string
  multifocal?: string | boolean
  useCase?: string
  budgetMin?: number
  budgetMax?: number
  budgetBucket?: 'low' | 'mid' | 'premium' | string
  priceModifier?: string
  limit?: number
}

/**
 * Wire shape returned to Rasa's `ServiceGateway.search_products`. Keys are
 * snake_case to match what `emit_product_card` expects in actions.py.
 */
export interface ProductWirePayload {
  product_id: string
  product_name: string
  category: string
  product_type: string
  brand: string
  price_myr: number
  description?: string | null
  frame_material?: string | null
  frame_shape?: string | null
  frame_color?: string | null
  gender?: string | null
  uv_protection?: string | null
  polarized?: string | null
  lens_color?: string | null
  frame_style?: string | null
  lens_type?: string | null
  lens_feature?: string | null
  lens_duration?: string | null
  multifocal?: string | null
  store_location?: string | null
  city?: string | null
  stock_status: string
  rating?: number | null
  bestseller: boolean
  new_arrival: boolean
  imageUrl?: string | null
  fallback_image_url?: string | null
}

export function toWirePayload(record: ProductRecord, publicBaseUrl?: string): ProductWirePayload {
  return {
    product_id: record.productId,
    product_name: record.productName,
    category: record.category,
    product_type: record.productType,
    brand: record.brand,
    price_myr: record.priceMyr,
    description: record.description ?? null,
    frame_material: record.frameMaterial ?? null,
    frame_shape: record.frameShape ?? null,
    frame_color: record.frameColor ?? null,
    gender: record.gender ?? null,
    uv_protection: record.uvProtection ?? null,
    polarized: record.polarized ?? null,
    lens_color: record.lensColor ?? null,
    frame_style: record.frameStyle ?? null,
    lens_type: record.lensType ?? null,
    lens_feature: record.lensFeature ?? null,
    lens_duration: record.lensDuration ?? null,
    multifocal: record.multifocal ?? null,
    store_location: record.storeLocation ?? null,
    city: record.city ?? null,
    stock_status: record.stockStatus,
    rating: record.rating ?? null,
    bestseller: record.bestseller,
    new_arrival: record.newArrival,
    imageUrl: absoluteImageUrl(record.imageUrl, publicBaseUrl),
    fallback_image_url: absoluteImageUrl(record.fallbackImageUrl, publicBaseUrl),
  }
}

function absoluteImageUrl(value: string | null | undefined, base?: string): string | null {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (!base) return value
  return `${base.replace(/\/$/, '')}${value.startsWith('/') ? value : `/${value}`}`
}
