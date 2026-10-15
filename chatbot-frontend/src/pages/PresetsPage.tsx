import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ListChecks, Pencil, Plus, Power, Sparkles, Trash2 } from 'lucide-react'
import {
  deletePreset,
  getPresets,
  setActivePreset,
  updatePreset,
} from '../api/client'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import PageContainer from '../components/PageContainer'
import Modal from '../components/Modal'
import RequiredMark from '../components/RequiredMark'
import Pagination from '../components/Pagination'
import Topbar from '../components/Topbar'
import { useSnackbar } from '../components/Snackbar'
import { SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import type { PresetRecord } from '../types'
import { pageSlice, useTablePaging } from '../lib/table-paging'

interface PresetDraft {
  name: string
  description: string
}

const emptyDraft: PresetDraft = { name: '', description: '' }

// Fixed one-line row height; rows per page = fit the screen, or the size picked in the footer (useTablePaging).
const ROW_HEIGHT_PX = 60

export default function PresetsPage() {
  const navigate = useNavigate()
  const [presets, setPresets] = useState<PresetRecord[] | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const paging = useTablePaging(tableHeaderRef, Boolean(presets))
  const rowsPerPage = paging.rowsPerPage
  const { pageCount, currentPage: shownPage, pageItems, visibleStart, visibleEnd } = pageSlice(presets ?? [], rowsPerPage, currentPage)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const snackbar = useSnackbar()
  const [activating, setActivating] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PresetDraft>(emptyDraft)
  const [nameError, setNameError] = useState<string | null>(null)
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
    try {
      const result = await setActivePreset(presetId)
      applyResult(result)
      snackbar.success(
        presetId
          ? `Activated "${result.items.find((p) => p.id === presetId)?.name ?? 'preset'}". The chatbot now suggests products from it.`
          : 'Preset turned off. The chatbot now recommends from the whole catalogue.',
      )
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to change active preset')
    } finally {
      setActivating(false)
    }
  }

  function openEdit(preset: PresetRecord) {
    setEditingId(preset.id)
    setDraft({ name: preset.name, description: preset.description ?? '' })
    setNameError(null)
    setEditorOpen(true)
  }

  // Editing only renames; new presets are made on the /presets/new screen, where products are chosen first.
  async function handleSave() {
    const name = draft.name.trim()
    if (!name || !editingId) {
      setNameError('Preset name is required.')
      return
    }
    setSaving(true)
    try {
      await updatePreset(editingId, { name, description: draft.description.trim() })
      snackbar.success('Preset updated.')
      setEditorOpen(false)
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to save preset')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePreset(deleteTarget.id)
      setDeleteTarget(null)
      snackbar.success('Preset deleted.')
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to delete preset')
    } finally {
      setDeleting(false)
    }
  }

  const activePreset = presets?.find((preset) => preset.id === activePresetId) ?? null

  return (
    // On desktop the page fills the screen; the table takes the remaining height and pages.
    <PageContainer className="lg:flex lg:h-[100dvh] lg:flex-col">
      <Topbar
        title="Presets"
        actions={(
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/presets/new')}>
            Add Preset
          </Button>
        )}
      />

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
          {/* Status of the chatbot's preset, with an off switch only when one is active. */}
          <section className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-calisto-line-subtle bg-calisto-surface px-5 py-4 shadow-sm">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  activePreset ? 'bg-calisto-accent/10 text-calisto-accent' : 'bg-calisto-table text-calisto-muted'
                }`}
              >
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-calisto-ink">
                  {activePreset ? <>Active preset: {activePreset.name}</> : 'No preset active'}
                </p>
                <p className="mt-0.5 text-sm text-calisto-body">
                  {activePreset
                    ? 'The chatbot recommends products from this preset first.'
                    : 'The chatbot recommends from the whole catalogue.'}
                </p>
              </div>
            </div>
            {activePreset && (
              <Button disabled={activating} icon={<Power className="h-4 w-4" />} onClick={() => handleActivate(null)}>
                Turn off
              </Button>
            )}
          </section>

          <section className="flex flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard lg:min-h-0 lg:flex-1">
            <div className="table-scroll flex flex-col overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto" {...paging.scrollProps}>
            <table className="table-edges w-full min-w-[720px] table-fixed border-collapse text-left text-sm lg:min-w-0">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[32%]" />
                <col className="w-[12%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-calisto-surface" ref={tableHeaderRef}>
                <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                  <th className="px-4 py-4">Preset</th>
                  <th className="px-4 py-4">Description</th>
                  <th className="px-4 py-4 text-center">Products</th>
                  <th className="px-4 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-calisto-line-subtle">
                {pageItems.map((preset) => {
                  const active = preset.id === activePresetId
                  return (
                    <tr key={preset.id} className="border-b border-calisto-line-subtle transition hover:bg-calisto-surface-muted" style={{ height: ROW_HEIGHT_PX }}>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-calisto-ink">{preset.name}</span>
                          {active && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-calisto-accent/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-calisto-accent">
                              <Check className="h-3 w-3" /> Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-calisto-body">
                        <span className="block truncate">{preset.description || '—'}</span>
                      </td>
                      <td className="px-4 py-2 text-center align-middle font-semibold text-calisto-body">
                        {preset.productCount}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={activating || active}
                            onClick={() => handleActivate(preset.id)}
                            className={`inline-flex h-8 w-[5.5rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 text-xs font-bold transition disabled:cursor-not-allowed ${
                              active
                                ? 'border-calisto-accent/30 bg-calisto-accent/10 text-calisto-accent'
                                : 'border-calisto-accent bg-calisto-accent text-calisto-surface hover:bg-calisto-accent/90 disabled:opacity-50'
                            }`}
                            title={active ? 'Already active' : 'Set as active'}
                          >
                            {active ? <><Check className="h-3 w-3" /> Active</> : 'Set active'}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/presets/${preset.id}/products`)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-calisto-line bg-calisto-surface text-calisto-ink transition hover:bg-calisto-surface-muted"
                            aria-label={`Manage products in ${preset.name}`}
                            title="Manage products"
                          >
                            <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(preset)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                            aria-label={`Edit ${preset.name}`}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(preset)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-calisto-surface text-rose-700 transition hover:bg-rose-50"
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
            {presets.length === 0 && (
              <EmptyState />
            )}
            </div>
            {presets.length > 0 && (
              <Pagination
                {...paging.pagination}
                currentPage={shownPage}
                onNextPage={() => setCurrentPage(shownPage + 1)}
                onPreviousPage={() => setCurrentPage(shownPage - 1)}
                pageCount={pageCount}
                totalCount={presets.length}
                visibleEnd={visibleEnd}
                visibleStart={visibleStart}
              />
            )}
          </section>
        </>
      )}

      {editorOpen && (
        <Modal
          dismissible={!saving}
          footer={(
            <>
              <Button onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving || !draft.name.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
          onClose={() => setEditorOpen(false)}
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
          size="sm"
          title="Edit Preset"
        >
          <div className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Name<RequiredMark /></span>
              <input
                autoFocus
                className={`h-11 w-full rounded-xl border bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus ${nameError ? 'border-rose-400' : 'border-calisto-line'}`}
                value={draft.name}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, name: event.target.value }))
                  setNameError(null)
                }}
                onBlur={() => {
                  if (!draft.name.trim()) setNameError('Preset name is required.')
                }}
                placeholder="e.g. Best Seller"
                aria-invalid={Boolean(nameError)}
              />
              {nameError && <p className="mt-1.5 text-xs font-medium text-rose-600">{nameError}</p>}
            </label>
            <label className="block">
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Description</span>
              <textarea
                className="min-h-24 w-full resize-y rounded-xl border border-calisto-line bg-calisto-surface p-3 text-sm font-medium leading-6 text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                value={draft.description}
                onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Optional short description"
              />
            </label>
            <p className="text-xs font-medium text-calisto-muted">
              Use the Manage products button on a preset to choose which products it contains.
            </p>
          </div>
        </Modal>
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
