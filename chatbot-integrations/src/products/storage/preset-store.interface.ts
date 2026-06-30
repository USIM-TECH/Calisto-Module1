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
}
