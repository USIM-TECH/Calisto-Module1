import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react'
import { createProduct, deleteProduct, getProduct, getProductImportTemplateUrl, getProducts, importProductsCsv, resolveAssetUrl, setProductPresetIds, updateProduct } from '../api/client'
import Button from '../components/Button'
import AddProductModal, { type ProductFormData } from '../components/AddProductModal'
import ImportCsvModal from '../components/ImportCsvModal'
import PageContainer from '../components/PageContainer'
import { SkeletonFilterBar, SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import type { ProductImportMode, ProductListResult, ProductRecord } from '../types'

const PAGE_SIZE = 10

function stockTone(status: string) {
  const s = (status ?? '').toLowerCase()
  if (s === 'in_stock') return 'bg-emerald-100 text-emerald-700'
  if (s === 'low_stock') return 'bg-amber-100 text-amber-700'
  if (s === 'out_of_stock') return 'bg-rose-100 text-rose-700'
  return 'bg-calisto-table text-calisto-body'
}

function productInitial(product: ProductRecord) {
  return (product.brand?.[0] ?? '?').toUpperCase()
}

function productThumbUrl(product: ProductRecord): string | undefined {
  return resolveAssetUrl(product.imageUrl ?? product.fallbackImageUrl ?? undefined)
}

function formatStockStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function appendField(payload: FormData, key: string, value: string | boolean | null) {
  if (value === null) {
    payload.set(key, '')
    return
  }
  payload.set(key, String(value))
}

function productFormToPayload(data: ProductFormData, includeProductId: boolean) {
  const payload = new FormData()
  if (includeProductId) appendField(payload, 'productId', data.productId)
  appendField(payload, 'productName', data.productName)
  appendField(payload, 'brand', data.brand)
  appendField(payload, 'category', data.category)
  appendField(payload, 'productType', data.productType)
  appendField(payload, 'gender', data.gender)
  appendField(payload, 'description', data.description)
  appendField(payload, 'priceMyr', data.price)
  appendField(payload, 'stockStatus', data.stockStatus)
  appendField(payload, 'rating', data.rating)
  appendField(payload, 'frameMaterial', data.material)
  appendField(payload, 'frameShape', data.shape)
  appendField(payload, 'frameColor', data.color)
  appendField(payload, 'frameStyle', data.style)
  appendField(payload, 'lensType', data.lensType)
  appendField(payload, 'lensColor', data.lensColor)
  appendField(payload, 'lensFeature', data.lensFeature)
  appendField(payload, 'lensDuration', data.lensDuration)
  appendField(payload, 'uvProtection', data.uvProtection === null ? '' : data.uvProtection ? 'yes' : 'no')
  appendField(payload, 'polarized', data.polarized === null ? '' : data.polarized ? 'yes' : 'no')
  appendField(payload, 'multifocal', data.multifocal === null ? '' : data.multifocal ? 'yes' : 'no')
  appendField(payload, 'storeLocation', data.storeLocation)
  appendField(payload, 'city', data.city)
  appendField(payload, 'bestseller', data.bestseller)
  appendField(payload, 'newArrival', data.newArrival)
  appendField(payload, 'imageUrl', data.imageUrl)
  if (data.imageFile) payload.set('image', data.imageFile)
  return payload
}

interface DeleteProductDialogProps {
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
  product: ProductRecord | null
}

function DeleteProductDialog({ deleting, onCancel, onConfirm, product }: DeleteProductDialogProps) {
  if (!product) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deleteProductTitle"
        className="w-full max-w-md rounded-2xl border border-calisto-line bg-calisto-surface p-6 text-calisto-ink shadow-dashboard"
      >
        <h2 id="deleteProductTitle" className="text-lg font-bold">Delete Product</h2>
        <p className="mt-3 text-sm leading-6 text-calisto-body">
          Are you sure you want to delete this product?
        </p>
        <p className="mt-2 text-sm font-semibold text-rose-700">
          This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onCancel} disabled={deleting}>Cancel</Button>
          <Button
            className="border-rose-700 bg-rose-700 text-calisto-surface hover:bg-rose-800"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const [data, setData] = useState<ProductListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [importingProducts, setImportingProducts] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductRecord | null>(null)
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)

  function loadProducts() {
    return getProducts()
      .then(setData)
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    if (!preview) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [preview])

  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.items.filter((product) => {
      const matchesQuery = !term || [
        product.productId,
        product.productName,
        product.brand,
        product.productType,
        product.category,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
      const matchesType = !typeFilter || product.productType === typeFilter
      const matchesBrand = !brandFilter || product.brand === brandFilter
      return matchesQuery && matchesType && matchesBrand
    })
  }, [data, search, typeFilter, brandFilter])

  const productTypes = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.items.map((item) => item.productType).filter(Boolean)))
  }, [data])

  const brands = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.items.map((item) => item.brand).filter(Boolean)))
  }, [data])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const visibleStart = filtered.length === 0 ? 0 : pageStart + 1
  const visibleEnd = Math.min(pageStart + PAGE_SIZE, filtered.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, typeFilter, brandFilter])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  function clearFilters() {
    setSearch('')
    setTypeFilter('')
    setBrandFilter('')
  }

  function openCreateModal() {
    setModalMode('create')
    setEditingProduct(null)
    setIsAddOpen(true)
    setError(null)
    setSuccessMessage(null)
  }

  async function openEditModal(productId: string) {
    setError(null)
    setSuccessMessage(null)
    try {
      const product = await getProduct(productId)
      setEditingProduct(product)
      setModalMode('edit')
      setIsAddOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product.')
    }
  }

  async function handleSaveProduct(form: ProductFormData) {
    setSavingProduct(true)
    try {
      if (modalMode === 'edit' && editingProduct) {
        await updateProduct(editingProduct.productId, productFormToPayload(form, false))
        await setProductPresetIds(editingProduct.productId, form.presetIds)
        setSuccessMessage('Product updated successfully.')
      } else {
        const created = await createProduct(productFormToPayload(form, true))
        await setProductPresetIds(created.productId, form.presetIds)
        setSuccessMessage('Product added successfully.')
      }
      await loadProducts()
    } finally {
      setSavingProduct(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeletingProduct(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await deleteProduct(deleteTarget.productId)
      setDeleteTarget(null)
      setSuccessMessage('Product deleted successfully.')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product.')
    } finally {
      setDeletingProduct(false)
    }
  }

  async function handleImportProducts(file: File, duplicateHandling: ProductImportMode) {
    setImportingProducts(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await importProductsCsv(file, duplicateHandling)
      await loadProducts()
      const parts = [
        result.inserted ? `${result.inserted} added` : null,
        result.updated ? `${result.updated} updated` : null,
        result.skipped ? `${result.skipped} skipped` : null,
      ].filter(Boolean)
      setSuccessMessage(parts.length > 0 ? `Import complete: ${parts.join(', ')}.` : 'Import complete.')
    } finally {
      setImportingProducts(false)
    }
  }

  function handleDownloadImportTemplate() {
    window.location.assign(getProductImportTemplateUrl())
  }

  return (
    <PageContainer>
      <Topbar
        title="Product Catalogue"
        actions={(
          <>
            <Button id="importCsvBtn" onClick={() => setIsImportOpen(true)}>Import CSV</Button>
            <Button id="addBtn" variant="primary" onClick={openCreateModal}>Add Product</Button>
          </>
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
      {!data && !error && (
        <>
          <SkeletonTopbar />
          <SkeletonFilterBar />
          <SkeletonTable
            cols={9}
            rows={8}
            headers={['', 'ID', 'Product', 'Type', 'Category', 'Price', 'Stock', 'Rating', 'Actions']}
          />
        </>
      )}
      {data && (
        <>
          <section className="mb-5 flex flex-col gap-4 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <input
                id="searchInput"
                className="h-11 min-w-0 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus lg:w-72"
                type="search"
                placeholder="Search id, name, brand..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                id="typeFilter"
                className="h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="">All product types</option>
                {productTypes.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <select
                id="brandFilter"
                className="h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
              >
                <option value="">All brands</option>
                {brands.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span id="resultCount" className="text-sm font-semibold text-calisto-muted">
                {filtered.length} products
              </span>
              <button id="clearFilters" className="text-sm font-bold text-indigo-600 transition hover:text-indigo-700" type="button" onClick={clearFilters}>
                Clear
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm lg:min-w-0">
                <colgroup>
                  <col className="w-[5%]" />
                  <col className="w-[10%]" />
                  <col className="w-[27%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[6%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead>
                  <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                    <th className="px-3 py-4 text-center"></th>
                    <th className="px-3 py-4">ID</th>
                    <th className="px-3 py-4">Product</th>
                    <th className="px-3 py-4">Type</th>
                    <th className="px-3 py-4">Category</th>
                    <th className="px-3 py-4 text-right">Price</th>
                    <th className="px-3 py-4 text-center">Stock</th>
                    <th className="px-3 py-4 text-center">Rating</th>
                    <th className="px-3 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody id="rows" className="divide-y divide-calisto-line-subtle">
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-12 text-center text-sm font-medium text-calisto-muted">No products yet. Click "Add Product".</td></tr>
                  )}
                  {paginated.map((product: ProductRecord) => (
                    <tr key={product.productId} className="transition hover:bg-calisto-surface-muted" data-product-id={product.productId}>
                      <td className="px-3 py-4 text-center align-middle">
                        {(() => {
                          const thumb = productThumbUrl(product)
                          return thumb ? (
                            <button
                              type="button"
                              onClick={() => setPreview({ url: thumb, name: product.productName })}
                              className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-1 ring-calisto-line transition hover:ring-2 hover:ring-calisto-accent focus:outline-none focus:ring-2 focus:ring-calisto-accent"
                              aria-label={`Preview ${product.productName}`}
                              title="Click to enlarge"
                            >
                              <img className="h-full w-full object-cover" src={thumb} alt={product.productName} />
                            </button>
                          ) : (
                            <div className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-violet-600 text-xs font-bold text-calisto-surface">
                              <span>{productInitial(product)}</span>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-4 align-middle font-mono text-[0.8rem] text-calisto-body"><span className="block truncate">{product.productId}</span></td>
                      <td className="px-3 py-4 align-middle">
                        <div className="truncate font-semibold text-calisto-ink">{product.productName}</div>
                        <div className="mt-0.5 truncate text-xs text-calisto-muted">{product.brand}</div>
                      </td>
                      <td className="px-3 py-4 align-middle text-calisto-body"><span className="block truncate">{product.productType}</span></td>
                      <td className="px-3 py-4 align-middle text-calisto-body"><span className="block truncate">{product.category}</span></td>
                      <td className="px-3 py-4 text-right align-middle font-mono text-[0.8rem] text-calisto-ink"><span className="block truncate">RM{product.priceMyr.toFixed(2)}</span></td>
                      <td className="px-3 py-4 text-center align-middle">
                        <span className={`inline-flex max-w-full items-center justify-center truncate rounded-full px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-wide ${stockTone(product.stockStatus)}`}>
                          {formatStockStatus(product.stockStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center align-middle text-calisto-body">{product.rating !== null && product.rating !== undefined ? product.rating.toFixed(1) : '-'}</td>
                      <td className="px-3 py-4 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                            type="button"
                            onClick={() => openEditModal(product.productId)}
                            aria-label={`Edit ${product.productName}`}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-calisto-surface text-rose-700 transition hover:bg-rose-50"
                            type="button"
                            onClick={() => setDeleteTarget(product)}
                            aria-label={`Delete ${product.productName}`}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-calisto-line-subtle px-5 py-4 text-sm text-calisto-muted sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">
                Showing {visibleStart}-{visibleEnd} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-calisto-line bg-calisto-surface px-3 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="min-w-24 text-center text-sm font-semibold text-calisto-body">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-calisto-line bg-calisto-surface px-3 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  disabled={currentPage === pageCount}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
      <AddProductModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSave={handleSaveProduct}
        initialData={editingProduct}
        mode={modalMode}
        saving={savingProduct}
      />
      <ImportCsvModal
        importing={importingProducts}
        onClose={() => setIsImportOpen(false)}
        onDownloadTemplate={handleDownloadImportTemplate}
        onImport={handleImportProducts}
        open={isImportOpen}
      />
      <DeleteProductDialog
        deleting={deletingProduct}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        product={deleteTarget}
      />
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/70 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.name} image preview`}
        >
          <div className="relative max-h-[85vh] max-w-[85vw]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute -right-3 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard transition hover:bg-calisto-surface-muted"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain shadow-dashboard"
            />
            <div className="mt-3 text-center text-sm font-semibold text-calisto-surface">{preview.name}</div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

