export interface PresetRecord {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PresetWithCount extends PresetRecord {
  productCount: number
}

export interface PresetListResult {
  items: PresetWithCount[]
  activePresetId: string | null
}

export interface PresetInput {
  name: string
  description?: string | null
}

export interface PresetUpdate {
  name?: string
  description?: string | null
}

/** Active preset plus its member product ids, consumed by Rasa for merchandising. */
export interface ActivePresetPayload {
  presetId: string | null
  name: string | null
  productIds: string[]
}
