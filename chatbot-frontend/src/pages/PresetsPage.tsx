import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import {
  createPreset,
  deletePreset,
  getPresets,
  setActivePreset,
  updatePreset,
} from '../api/client'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import Topbar from '../components/Topbar'
import { SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import type { PresetRecord } from '../types'

interface PresetDraft {
  name: string
  description: string
}

const emptyDraft: PresetDraft = { name: '', description: '' }

export default function PresetsPage() {
  const [presets, setPresets] = useState<PresetRecord[] | null>(null)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PresetDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<PresetRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  function applyResult(result: { items: PresetRecord[]; activePresetId: string | null }) {
    setPresets(result.items)
    setActivePresetId(result.activePresetId)
  }

  function load() {
    return getPresets()
      .then(applyResult)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load presets'))
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleActivate(presetId: string | null) {
    setActivating(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await setActivePreset(presetId)
      applyResult(result)
      setSuccessMessage(
        presetId
          ? `Activated "${result.items.find((p) => p.id === presetId)?.name ?? 'preset'}". The chatbot now suggests products from it.`
          : 'Switched to default — the chatbot ranks across the whole catalogue.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change active preset')
    } finally {
      setActivating(false)
    }
  }

  function openCreate() {
    setEditorMode('create')
    setEditingId(null)
    setDraft(emptyDraft)
    setEditorOpen(true)
    setError(null)
    setSuccessMessage(null)
  }

  function openEdit(preset: PresetRecord) {
    setEditorMode('edit')
    setEditingId(preset.id)
    setDraft({ name: preset.name, description: preset.description ?? '' })
    setEditorOpen(true)
    setError(null)
    setSuccessMessage(null)
  }

  async function handleSave() {
    const name = draft.name.trim()
    if (!name) {
      setError('Preset name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editorMode === 'edit' && editingId) {
        await updatePreset(editingId, { name, description: draft.description.trim() })
        setSuccessMessage('Preset updated.')
      } else {
        await createPreset({ name, description: draft.description.trim() })
        setSuccessMessage('Preset created.')
      }
      setEditorOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deletePreset(deleteTarget.id)
      setDeleteTarget(null)
      setSuccessMessage('Preset deleted.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset')
    } finally {
      setDeleting(false)
    }
  }

  const isDefault = activePresetId === null

  return (
    <PageContainer>
      <Topbar
        title="Presets"
        actions={(
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add Preset
          </Button>
        )}
      />

      {successMessage && (
        <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm font-semibold text-emerald-700 shadow-sm">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {!presets && !error && (
        <>
          <SkeletonTopbar />
          <SkeletonTable cols={4} rows={5} headers={['Preset', 'Description', 'Products', 'Actions']} />
        </>
      )}

      {presets && (
        <>
          <section className="mb-5 rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-5 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-calisto-ink">
              <Sparkles className="h-4 w-4 text-calisto-accent" />
              Active Preset
            </div>
            <p className="mt-2 text-sm font-medium text-calisto-body">
              The active preset decides which products the chatbot suggests to every user. If a shopper asks for
              something not in the active preset, the bot still shows the closest exact matches from the full catalogue.
            </p>
            <button
              type="button"
              disabled={activating}
              onClick={() => handleActivate(null)}
              className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                isDefault
                  ? 'border-calisto-accent bg-calisto-accent/10 text-calisto-accent'
                  : 'border-calisto-line bg-calisto-surface text-calisto-body hover:bg-calisto-surface-muted'
              }`}
            >
              {isDefault && <Check className="h-4 w-4" />}
              Default (no preset) — rank across the whole catalogue
            </button>
          </section>

          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm lg:min-w-0">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[40%]" />
                <col className="w-[14%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                  <th className="px-4 py-4">Preset</th>
                  <th className="px-4 py-4">Description</th>
                  <th className="px-4 py-4 text-center">Products</th>
                  <th className="px-4 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-calisto-line-subtle">
                {presets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm font-medium text-calisto-muted">
                      No presets yet. Click "Add Preset" to create one.
                    </td>
                  </tr>
                )}
                {presets.map((preset) => {
                  const active = preset.id === activePresetId
                  return (
                    <tr key={preset.id} className="transition hover:bg-calisto-surface-muted">
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-calisto-ink">{preset.name}</span>
                          {active && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-calisto-accent/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-calisto-accent">
                              <Check className="h-3 w-3" /> Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle text-calisto-body">
                        <span className="block truncate">{preset.description || '—'}</span>
                      </td>
                      <td className="px-4 py-4 text-center align-middle font-semibold text-calisto-body">
                        {preset.productCount}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={activating || active}
                            onClick={() => handleActivate(preset.id)}
                            className="inline-flex h-8 items-center rounded-lg border border-calisto-accent bg-calisto-accent px-3 text-xs font-bold text-calisto-surface transition hover:bg-calisto-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                            title={active ? 'Already active' : 'Set as active'}
                          >
                            {active ? 'Active' : 'Set active'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(preset)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                            aria-label={`Edit ${preset.name}`}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(preset)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-calisto-surface text-rose-700 transition hover:bg-rose-50"
                            aria-label={`Delete ${preset.name}`}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="presetEditorTitle"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard"
          >
            <div className="flex items-start justify-between gap-4 border-b border-calisto-line px-6 py-5">
              <h2 id="presetEditorTitle" className="text-lg font-bold text-calisto-ink">
                {editorMode === 'edit' ? 'Edit Preset' : 'Add Preset'}
              </h2>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface text-calisto-ink transition hover:bg-calisto-surface-muted"
                onClick={() => setEditorOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5">
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Name</span>
                <input
                  autoFocus
                  className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Best Seller"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Description</span>
                <textarea
                  className="min-h-24 w-full resize-y rounded-xl border border-calisto-line bg-calisto-table p-3 text-sm font-medium leading-6 text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  value={draft.description}
                  onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Optional short description"
                />
              </label>
              <p className="text-xs font-medium text-calisto-muted">
                Add products to this preset from the Products page (edit a product, then tick the preset).
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-calisto-line px-6 py-5">
              <Button onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deletePresetTitle"
            className="w-full max-w-md rounded-2xl border border-calisto-line bg-calisto-surface p-6 text-calisto-ink shadow-dashboard"
          >
            <h2 id="deletePresetTitle" className="text-lg font-bold">Delete Preset</h2>
            <p className="mt-3 text-sm leading-6 text-calisto-body">
              Delete the preset "{deleteTarget.name}"? Product memberships for this preset are removed. Products themselves are not affected.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
              <Button
                className="border-rose-700 bg-rose-700 text-calisto-surface hover:bg-rose-800"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
