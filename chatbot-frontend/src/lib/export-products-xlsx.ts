import type { ProductRecord } from '../types'
import { downloadXlsx } from './download-xlsx'

const PRODUCT_HEADERS = [
  'product_id',
  'product_name',
  'category',
  'product_type',
  'brand',
  'price_myr',
  'gender',
  'description',
  'stock_status',
  'rating',
  'material',
  'shape',
  'color',
  'style',
  'lens_type',
  'lens_color',
  'lens_feature',
  'lens_duration',
  'uv_protection',
  'polarized',
  'multifocal',
  'store_location',
  'city',
  'bestseller',
  'new_arrival',
  'image_url',
] as const

function yesNo(value: boolean | undefined | null): string {
  return value ? 'yes' : 'no'
}

function productToRow(product: ProductRecord) {
  return [
    product.productId,
    product.productName,
    product.category,
    product.productType,
    product.brand,
    product.priceMyr,
    product.gender ?? '',
    product.description ?? '',
    product.stockStatus,
    product.rating ?? '',
    product.frameMaterial ?? '',
    product.frameShape ?? '',
    product.frameColor ?? '',
    product.frameStyle ?? '',
    product.lensType ?? '',
    product.lensColor ?? '',
    product.lensFeature ?? '',
    product.lensDuration ?? '',
    product.uvProtection ?? '',
    product.polarized ?? '',
    product.multifocal ?? '',
    product.storeLocation ?? '',
    product.city ?? '',
    yesNo(product.bestseller),
    yesNo(product.newArrival),
    product.imageUrl ?? product.fallbackImageUrl ?? '',
  ]
}

export async function downloadProductsXlsx(products: ProductRecord[]): Promise<void> {
  downloadXlsx(
    `calisto-products-${new Date().toISOString().slice(0, 10)}.xlsx`,
    'Products',
    [...PRODUCT_HEADERS],
    products.map(productToRow),
  )
}
