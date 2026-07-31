import type {
  ProductInput,
  ProductListQuery,
  ProductListResult,
  ProductRecord,
  ProductUpdate,
} from '../types.js'

export interface ProductStore {
  list(query?: ProductListQuery): Promise<ProductListResult>
  listAll(): Promise<ProductRecord[]>
  get(productId: string): Promise<ProductRecord | undefined>
  exists(productId: string): Promise<boolean>
  create(input: ProductInput): Promise<ProductRecord>
  update(productId: string, patch: ProductUpdate): Promise<ProductRecord | undefined>
  delete(productId: string): Promise<boolean>
  /** Returns the next available `P####` id given current max. */
  nextId(): Promise<string>
  distinctProductTypes(): Promise<string[]>
  distinctBrands(): Promise<string[]>
}
