import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { createProduct, deleteProduct, getProduct, getProductImportTemplateUrl, getProducts, importProducts, setProductPresetIds, updateProduct } from '../api/client'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import AddProductModal, { type ProductFormData } from '../components/AddProductModal'
import ImportProductsModal from '../components/ImportProductsModal'
import PageContainer from '../components/PageContainer'
import Pagination from '../components/Pagination'
import Select from '../components/Select'
import { SkeletonFilterBar, SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import { useSnackbar } from '../components/Snackbar'
import { downloadProductsXlsx } from '../lib/export-products-xlsx'
import { formatStockStatus, stockTone } from '../lib/product-display'
import { pageSlice, useTablePaging } from '../lib/table-paging'
import type { ProductImportMode, ProductListResult, ProductRecord } from '../types'

// Fixed one-line row height; rows per page = fit the screen, or the size picked in the footer (useTablePaging).
const ROW_HEIGHT_PX = 64

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
  const snackbar = useSnackbar()
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
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const paging = useTablePaging(tableHeaderRef, Boolean(data))
  const rowsPerPage = paging.rowsPerPage

  function loadProducts() {
    return getProducts()
      .then(setData)
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    loadProducts()
  }, [])

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

  const { pageCount, pageItems: paginated, visibleStart, visibleEnd } = pageSlice(filtered, rowsPerPage, currentPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, typeFilter, brandFilter])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  function openCreateModal() {
    setModalMode('create')
    setEditingProduct(null)
    setIsAddOpen(true)
  }

  async function openEditModal(productId: string) {
    try {
      const product = await getProduct(productId)
      setEditingProduct(product)
      setModalMode('edit')
      setIsAddOpen(true)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to load product.')
    }
  }

  async function handleSaveProduct(form: ProductFormData) {
    setSavingProduct(true)
    try {
      if (modalMode === 'edit' && editingProduct) {
        await updateProduct(editingProduct.productId, productFormToPayload(form, false))
        await setProductPresetIds(editingProduct.productId, form.presetIds)
        snackbar.success('Product updated successfully.')
      } else {
        const created = await createProduct(productFormToPayload(form, true))
        await setProductPresetIds(created.productId, form.presetIds)
        snackbar.success('Product added successfully.')
      }
      await loadProducts()
    } finally {
      setSavingProduct(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeletingProduct(true)
    try {
      await deleteProduct(deleteTarget.productId)
      setDeleteTarget(null)
      snackbar.success('Product deleted successfully.')
      await loadProducts()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to delete product.')
    } finally {
      setDeletingProduct(false)
    }
  }

  async function handleImportProducts(file: File, duplicateHandling: ProductImportMode) {
    setImportingProducts(true)
    try {
      const result = await importProducts(file, duplicateHandling)
      await loadProducts()
      const parts = [
        result.inserted ? `${result.inserted} added` : null,
        result.updated ? `${result.updated} updated` : null,
        result.skipped ? `${result.skipped} skipped` : null,
      ].filter(Boolean)
      snackbar.success(parts.length > 0 ? `Import complete: ${parts.join(', ')}.` : 'Import complete.')
    } finally {
      setImportingProducts(false)
    }
  }

  function handleDownloadImportTemplate() {
    window.location.assign(getProductImportTemplateUrl())
  }

  function handleExportProducts() {
    downloadProductsXlsx(filtered)
  }

  return (
    // On desktop the page fills the screen; the table takes the remaining height and pages.
    <PageContainer className="lg:flex lg:h-[100dvh] lg:flex-col">
      <Topbar
        title="Product Catalogue"
        actions={(
          <Button id="addBtn" icon={<Plus className="h-4 w-4" />} variant="primary" onClick={openCreateModal}>Add Product</Button>
        )}
      />

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
            cols={8}
            rows={8}
            headers={['ID', 'Product', 'Type', 'Category', 'Price', 'Stock', 'Rating', 'Actions']}
          />
        </>
      )}
      {data && (
        <>
          {/* Same layout as the Leads filter bar: search fills the row, filters on the right. */}
          <section className="mb-5 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative flex min-w-0 flex-1 items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-calisto-soft" />
                <input
                  id="searchInput"
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
                  id="typeFilter"
                  onChange={setTypeFilter}
                  options={[{ value: '', label: 'All product types' }, ...productTypes.map((value) => ({ value, label: value }))]}
                  value={typeFilter}
                />
                <Select
                  aria-label="Filter by brand"
                  id="brandFilter"
                  onChange={setBrandFilter}
                  options={[{ value: '', label: 'All brands' }, ...brands.map((value) => ({ value, label: value }))]}
                  value={brandFilter}
                />
                <Button
                  className="h-11"
                  disabled={filtered.length === 0}
                  icon={<Download className="h-4 w-4" />}
                  onClick={handleExportProducts}
                  variant="primary"
                >
                  Export
                </Button>
                <Button className="h-11" icon={<Upload className="h-4 w-4" />} id="importProductsBtn" onClick={() => setIsImportOpen(true)} variant="primary">
                  Import XLSX
                </Button>
              </div>
            </div>
          </section>

          <section className="flex flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard lg:min-h-0 lg:flex-1">
            <div className="table-scroll flex flex-col overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto" {...paging.scrollProps}>
              <table className="table-edges w-full min-w-[900px] table-fixed border-collapse text-left text-sm lg:min-w-0">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[28%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-calisto-surface" ref={tableHeaderRef}>
                  <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
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
                  {paginated.map((product: ProductRecord) => (
                    <tr key={product.productId} className="border-b border-calisto-line-subtle transition hover:bg-calisto-surface-muted" data-product-id={product.productId} style={{ height: ROW_HEIGHT_PX }}>
                      <td className="px-3 py-2 align-middle tabular-nums text-calisto-body"><span className="block truncate">{product.productId}</span></td>
                      <td className="px-3 py-2 align-middle">
                        <div className="truncate font-semibold text-calisto-ink">{product.productName}</div>
                        <div className="mt-0.5 truncate text-xs text-calisto-muted">{product.brand}</div>
                      </td>
                      <td className="px-3 py-2 align-middle text-calisto-body"><span className="block truncate">{product.productType}</span></td>
                      <td className="px-3 py-2 align-middle text-calisto-body"><span className="block truncate">{product.category}</span></td>
                      <td className="px-3 py-2 text-right align-middle tabular-nums text-calisto-ink"><span className="block truncate">RM{product.priceMyr.toFixed(2)}</span></td>
                      <td className="px-3 py-2 text-center align-middle">
                        <span className={`inline-flex max-w-full items-center justify-center truncate rounded-full px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-wide ${stockTone(product.stockStatus)}`}>
                          {formatStockStatus(product.stockStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center align-middle text-calisto-body">{product.rating !== null && product.rating !== undefined ? product.rating.toFixed(1) : '-'}</td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                            type="button"
                            onClick={() => openEditModal(product.productId)}
                            aria-label={`Edit ${product.productName}`}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-calisto-surface text-rose-700 transition hover:bg-rose-50"
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
              {filtered.length === 0 && <EmptyState />}
            </div>
            {filtered.length > 0 && (
              <Pagination
                {...paging.pagination}
                currentPage={currentPage}
                onNextPage={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
                onPreviousPage={() => setCurrentPage(Math.max(1, currentPage - 1))}
                pageCount={pageCount}
                totalCount={filtered.length}
                visibleEnd={visibleEnd}
                visibleStart={visibleStart}
              />
            )}
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
      <ImportProductsModal
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
    </PageContainer>
  )
}

