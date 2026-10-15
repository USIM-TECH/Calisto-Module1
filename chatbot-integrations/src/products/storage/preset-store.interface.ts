import type {
  ActivePresetPayload,
  PresetInput,
  PresetListResult,
  PresetRecord,
  PresetUpdate,
} from '../preset-types.js'

export interface PresetStore {
  list(): Promise<PresetListResult>
  get(id: string): Promise<PresetRecord | undefined>
  create(input: PresetInput): Promise<PresetRecord>
  update(id: string, patch: PresetUpdate): Promise<PresetRecord | undefined>
  delete(id: string): Promise<boolean>
  /** Activate exactly one preset, or pass null to clear (default behaviour). */
  setActive(id: string | null): Promise<void>
  /** Active preset and its member product ids; null preset = no active preset. */
  getActive(): Promise<ActivePresetPayload>
  /** Preset ids a product currently belongs to. */
  getPresetIdsForProduct(productId: string): Promise<string[]>
  /** Replace the full set of presets a product belongs to. */
  setPresetsForProduct(productId: string, presetIds: string[]): Promise<void>
  /** Product ids that belong to a preset. */
  getProductIdsForPreset(presetId: string): Promise<string[]>
  /**
   * Add and remove many products from one preset in a single step. Only the
   * listed products change; the rest of the preset is left alone. Unknown
   * product ids in `add` are ignored. Returns how many were added and removed.
   */
  updatePresetMembers(presetId: string, add: string[], remove: string[]): Promise<{ added: number; removed: number }>
}
