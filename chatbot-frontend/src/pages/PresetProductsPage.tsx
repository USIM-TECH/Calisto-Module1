import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Save, Search } from 'lucide-react'
import { createPreset, getAllProducts, getPresetMembers, getPresets, updatePresetMembers } from '../api/client'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import PageContainer from '../components/PageContainer'
import Pagination from '../components/Pagination'
import RequiredMark from '../components/RequiredMark'
import Select from '../components/Select'
import { SkeletonFilterBar, SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import { useSnackbar } from '../components/Snackbar'
import { formatStockStatus, stockTone } from '../lib/product-display'
import { pageSlice, useTablePaging } from '../lib/table-paging'
import type { PresetRecord, ProductRecord } from '../types'

// Fixed one-line row height; rows per page = fit the screen, or the size picked in the footer (useTablePaging).
const ROW_HEIGHT_PX = 60

type Scope = 'all' | 'in' | 'out'

const SCOPE_OPTIONS: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'All products' },
  { value: 'in', label: 'In this preset' },
  { value: 'out', label: 'Not in this preset' },
]

/**
 * Two modes on one screen. With a preset id it manages that preset's products. Without one
 * (`/presets/new`) it creates a preset: the name and the products are chosen first, and
 * nothing exists until Save, so a half-made preset never shows up in the Presets table.
 */
export default function PresetProductsPage() {
  const { presetId = '' } = useParams()
  const isNew = presetId === ''
  const navigate = useNavigate()
  const snackbar = useSnackbar()

  const [preset, setPreset] = useState<PresetRecord | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRecord[] | null>(null)
  // What the server has saved vs. what is ticked right now; the difference is the pending change.
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const paging = useTablePaging(tableHeaderRef, Boolean(products))
  const rowsPerPage = paging.rowsPerPage
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    if (isNew) {
      getAllProducts()
        .then((allProducts) => { if (!cancelled) setProducts(allProducts) })
        .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load products') })
      return () => { cancelled = true }
    }
    Promise.all([getPresets(), getAllProducts(), getPresetMembers(presetId)])
      .then(([presets, allProducts, members]) => {
        if (cancelled) return
        const found = presets.items.find((item) => item.id === presetId)
        if (!found) {
          setError('Preset not found. It may have been deleted.')
          return
        }
        setPreset(found)
        setProducts(allProducts)
        setSaved(new Set(members.productIds))
        setSelected(new Set(members.productIds))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load preset products')
      })
    return () => { cancelled = true }
  }, [presetId, isNew])

  const toAdd = useMemo(() => [...selected].filter((id) => !saved.has(id)), [selected, saved])
  const toRemove = useMemo(() => [...saved].filter((id) => !selected.has(id)), [selected, saved])
  const dirty = isNew
    ? name.trim() !== '' || description.trim() !== '' || selected.size > 0
    : toAdd.length + toRemove.length > 0
  // A new preset needs a name and at least one product; an existing one just needs a change.
  const canSave = isNew ? name.trim() !== '' && selected.size > 0 : dirty
  const presetName = preset?.name ?? (name.trim() || 'new preset')

  // Closing the tab or reloading would silently drop unsaved ticks.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const productTypes = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.productType).filter(Boolean))).sort(),
    [products],
  )
  const brands = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.brand).filter(Boolean))).sort(),
    [products],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (products ?? []).filter((product) => {
      if (typeFilter && product.productType !== typeFilter) return false
      if (brandFilter && product.brand !== brandFilter) return false
      if (scope === 'in' && !saved.has(product.productId)) return false
      if (scope === 'out' && saved.has(product.productId)) return false
      if (!term) return true
      return [product.productId, product.productName, product.brand, product.productType, product.category]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [products, search, typeFilter, brandFilter, scope, saved])

  const { pageCount, currentPage: shownPage, pageItems, visibleStart, visibleEnd } = pageSlice(filtered, rowsPerPage, currentPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, typeFilter, brandFilter, scope])

  // The header checkbox covers every matching product, not just the rows on this page.
  const selectedInFiltered = filtered.reduce((count, p) => count + (selected.has(p.productId) ? 1 : 0), 0)
  const allFilteredSelected = filtered.length > 0 && selectedInFiltered === filtered.length
  const someFilteredSelected = selectedInFiltered > 0 && !allFilteredSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someFilteredSelected
  }, [someFilteredSelected])

  function toggleOne(productId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  function toggleAllFiltered() {
    setSelected((current) => {
      const next = new Set(current)
      for (const product of filtered) {
        if (allFilteredSelected) next.delete(product.productId)
        else next.add(product.productId)
      }
      return next
    })
  }

  function handleBack() {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return
    navigate('/presets')
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Preset name is required.')
      return
    }
    if (selected.size === 0) return
    setSaving(true)
    let created: PresetRecord
    try {
      created = await createPreset({ name: trimmed, description: description.trim() })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create preset'
      if (/already exists/i.test(message)) setNameError('A preset with that name already exists.')
      else snackbar.error(message)
      setSaving(false)
      return
    }
    try {
      const result = await updatePresetMembers(created.id, { add: [...selected], remove: [] })
      snackbar.success(`Created "${created.name}" with ${result.productIds.length} product${result.productIds.length === 1 ? '' : 's'}.`)
      navigate('/presets')
    } catch (err) {
      // The preset exists now; send them to its screen to add the products again.
      snackbar.error(`Preset "${created.name}" was created, but adding its products failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      navigate(`/presets/${created.id}/products`)
    }
  }

  async function handleSave() {
    if (isNew) return handleCreate()
    if (!dirty) return
    setSaving(true)
    try {
      const result = await updatePresetMembers(presetId, { add: toAdd, remove: toRemove })
      const members = new Set(result.productIds)
      setSaved(members)
      setSelected(new Set(members))
      setPreset((current) => (current ? { ...current, productCount: members.size } : current))
      const parts = [
        result.added > 0 ? `${result.added} added` : '',
        result.removed > 0 ? `${result.removed} removed` : '',
      ].filter(Boolean)
      snackbar.success(`${preset?.name ?? 'Preset'} updated${parts.length ? `: ${parts.join(', ')}` : ''}.`)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to save preset products')
    } finally {
      setSaving(false)
    }
  }

  return (
    // On desktop the page fills the screen; the table takes the remaining height and pages.
    <PageContainer className="lg:flex lg:h-[100dvh] lg:flex-col">
      {!products && !error && (
        <>
          <SkeletonTopbar />
          <SkeletonFilterBar />
          <SkeletonTable cols={7} rows={8} headers={['', 'ID', 'Product', 'Type', 'Price', 'Stock', 'Status']} />
        </>
      )}

      {error && (
        <>
          <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
            {error}
          </div>
          <div><Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/presets')}>Back to presets</Button></div>
        </>
      )}

      {products && (preset || isNew) && (
        <>
          <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button
                className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-calisto-body transition hover:text-calisto-ink"
                onClick={handleBack}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" /> Presets
              </button>
              <h1 className="truncate text-2xl font-bold tracking-normal text-calisto-ink sm:text-3xl">
                {isNew ? 'New preset' : preset?.name}
              </h1>
              <p className="mt-1 max-w-xl text-sm text-calisto-body">
                {isNew
                  ? 'Name the preset and choose the products it contains. It is only added to the list when you create it.'
                  : `${saved.size} of ${products.length} products in this preset. Tick products, then save.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:shrink-0 lg:flex-nowrap">
              {isNew ? (
                <span className="text-sm font-semibold text-calisto-body" aria-live="polite">
                  {selected.size} product{selected.size === 1 ? '' : 's'} selected
                </span>
              ) : dirty && (
                <span className="text-sm font-semibold text-calisto-body" aria-live="polite">
                  {[toAdd.length > 0 ? `+${toAdd.length} to add` : '', toRemove.length > 0 ? `−${toRemove.length} to remove` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              <Button
                disabled={(isNew ? selected.size === 0 : !dirty) || saving}
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => setSelected(new Set(saved))}
              >
                {isNew ? 'Clear selection' : 'Reset'}
              </Button>
              <Button
                disabled={!canSave || saving}
                icon={<Save className="h-4 w-4" />}
                onClick={() => void handleSave()}
                title={isNew && !canSave ? 'Enter a name and tick at least one product' : undefined}
                variant="primary"
              >
                {saving ? 'Saving…' : isNew ? 'Create preset' : 'Save changes'}
              </Button>
            </div>
          </header>

          {isNew && (
            <section className="mb-5 grid gap-4 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Name<RequiredMark /></span>
                <input
                  autoFocus
                  aria-invalid={Boolean(nameError)}
                  className={`h-11 w-full rounded-xl border bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus ${nameError ? 'border-rose-400' : 'border-calisto-line'}`}
                  onBlur={() => { if (!name.trim()) setNameError('Preset name is required.') }}
                  onChange={(event) => { setName(event.target.value); setNameError(null) }}
                  placeholder="e.g. Best Seller"
                  value={name}
                />
                {nameError && <p className="mt-1.5 text-xs font-medium text-rose-600">{nameError}</p>}
              </label>
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Description</span>
                <input
                  className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional short description"
                  value={description}
                />
              </label>
            </section>
          )}

          <section className="mb-5 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex min-w-0 flex-1 items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-calisto-soft" />
                <input
                  className="h-11 w-full rounded-lg border border-calisto-line bg-calisto-surface pl-10 pr-4 text-sm text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/30 focus:ring-4 focus:ring-calisto-focus"
                  type="search"
                  placeholder="Search id, name, brand..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Select
                  aria-label="Filter by product type"
                  onChange={setTypeFilter}
                  options={[{ value: '', label: 'All product types' }, ...productTypes.map((value) => ({ value, label: value }))]}
                  value={typeFilter}
                />
                <Select
                  aria-label="Filter by brand"
                  onChange={setBrandFilter}
                  options={[{ value: '', label: 'All brands' }, ...brands.map((value) => ({ value, label: value }))]}
                  value={brandFilter}
                />
                {!isNew && (
                  <Select
                    aria-label="Show products by preset membership"
                    onChange={(value) => setScope(value as Scope)}
                    options={SCOPE_OPTIONS}
                    value={scope}
                  />
                )}
              </div>
            </div>
          </section>

          <section className="flex flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard lg:min-h-0 lg:flex-1">
            <div className="table-scroll flex flex-col overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto" {...paging.scrollProps}>
              <table className="table-edges w-full min-w-[820px] table-fixed border-collapse text-left text-sm lg:min-w-0">
                <colgroup>
                  <col className="w-[7%]" />
                  <col className="w-[11%]" />
                  <col className="w-[29%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-calisto-surface" ref={tableHeaderRef}>
                  <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                    <th className="px-4 py-4">
                      <input
                        aria-label={`Select all ${filtered.length} matching products`}
                        checked={allFilteredSelected}
                        className="h-4 w-4 cursor-pointer accent-calisto-accent disabled:cursor-not-allowed"
                        disabled={filtered.length === 0}
                        onChange={toggleAllFiltered}
                        ref={selectAllRef}
                        title={`Select or clear all ${filtered.length} matching products, not just this page`}
                        type="checkbox"
                      />
                    </th>
                    <th className="px-3 py-4">ID</th>
                    <th className="px-3 py-4">Product</th>
                    <th className="px-3 py-4">Type</th>
                    <th className="px-3 py-4 text-right">Price</th>
                    <th className="px-3 py-4 text-center">Stock</th>
                    <th className="px-3 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-calisto-line-subtle">
                  {pageItems.map((product) => {
                    const isSelected = selected.has(product.productId)
                    const wasSaved = saved.has(product.productId)
                    const status = isSelected && !wasSaved ? 'add' : !isSelected && wasSaved ? 'remove' : wasSaved ? 'in' : 'none'
                    return (
                      <tr
                        className={`border-b border-calisto-line-subtle transition hover:bg-calisto-surface-muted ${isSelected ? 'bg-calisto-accent/[0.04]' : ''}`}
                        key={product.productId}
                        style={{ height: ROW_HEIGHT_PX }}
                      >
                        <td className="px-4 py-2 align-middle">
                          <input
                            aria-label={`${isSelected ? 'Remove' : 'Add'} ${product.productName} ${isSelected ? 'from' : 'to'} ${presetName}`}
                            checked={isSelected}
                            className="h-4 w-4 cursor-pointer accent-calisto-accent"
                            onChange={() => toggleOne(product.productId)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-2 align-middle tabular-nums text-calisto-body"><span className="block truncate">{product.productId}</span></td>
                        <td className="px-3 py-2 align-middle">
                          <div className="truncate font-semibold text-calisto-ink">{product.productName}</div>
                          <div className="mt-0.5 truncate text-xs text-calisto-muted">{product.brand}</div>
                        </td>
                        <td className="px-3 py-2 align-middle text-calisto-body"><span className="block truncate">{product.productType}</span></td>
                        <td className="px-3 py-2 text-right align-middle tabular-nums text-calisto-ink">RM{product.priceMyr.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center align-middle">
                          <span className={`inline-flex max-w-full items-center justify-center truncate rounded-full px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-wide ${stockTone(product.stockStatus)}`}>
                            {formatStockStatus(product.stockStatus)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          {status === 'in' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-wide text-emerald-700">In preset</span>}
                          {status === 'add' && <span className="rounded-full bg-amber-100 px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-wide text-amber-700">Will add</span>}
                          {status === 'remove' && <span className="rounded-full bg-rose-100 px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-wide text-rose-700">Will remove</span>}
                          {status === 'none' && <span className="text-calisto-soft">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyState />}
            </div>
            {filtered.length > 0 && (
              <>
                <p className="border-t border-calisto-line-subtle bg-calisto-surface-muted px-5 py-2.5 text-xs font-medium text-calisto-muted">
                  {selectedInFiltered} of {filtered.length} matching products ticked. The header checkbox selects all {filtered.length} matching, not just this page.
                </p>
                <Pagination
                  {...paging.pagination}
                  currentPage={shownPage}
                  onNextPage={() => setCurrentPage(Math.min(pageCount, shownPage + 1))}
                  onPreviousPage={() => setCurrentPage(Math.max(1, shownPage - 1))}
                  pageCount={pageCount}
                  totalCount={filtered.length}
                  visibleEnd={visibleEnd}
                  visibleStart={visibleStart}
                />
              </>
            )}
          </section>
        </>
      )}
    </PageContainer>
  )
}
