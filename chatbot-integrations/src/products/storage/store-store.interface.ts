export interface StoreRecord {
  id: string
  name: string
  address: string | null
  phone: string | null
  state: string | null
  city: string
  imageUrl: string | null
  fallbackImageUrl: string | null
  mapUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface StoreInput {
  name: string
  address?: string | null
  phone?: string | null
  state?: string | null
  city: string
  imageUrl?: string | null
  fallbackImageUrl?: string | null
  mapUrl?: string | null
}

export type StoreUpdate = Partial<StoreInput>

export interface StoreListQuery {
  city?: string
  state?: string
  limit?: number
}

export interface StoreListResult {
  items: StoreRecord[]
  total: number
}

export interface StoreStore {
  list(query?: StoreListQuery): Promise<StoreListResult>
  get(id: string): Promise<StoreRecord | undefined>
  getByCity(city: string, limit?: number): Promise<StoreRecord[]>
  exists(id: string): Promise<boolean>
  create(input: StoreInput): Promise<StoreRecord>
  update(id: string, patch: StoreUpdate): Promise<StoreRecord | undefined>
  delete(id: string): Promise<boolean>
  importMany(inputs: StoreInput[]): Promise<number>
  distinctCities(): Promise<string[]>
  distinctStates(): Promise<string[]>
}
