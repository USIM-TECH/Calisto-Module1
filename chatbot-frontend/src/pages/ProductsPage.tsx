import { useEffect, useMemo, useState } from 'react'
import { getProducts } from '../api/client'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import Topbar from '../components/Topbar'
import type { ProductListResult, ProductRecord } from '../types'

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

export default function ProductsPage() {
  const [data, setData] = useState<ProductListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')

  useEffect(() => {
    getProducts()
      .then(setData)
      .catch((err) => setError(err.message))
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

  function clearFilters() {
    setSearch('')
    setTypeFilter('')
    setBrandFilter('')
  }

  return (
    <PageContainer>
      <Topbar
        title="Product Catalogue"
        actions={<Button id="addBtn" variant="primary">Add Product</Button>}
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}
      {!data && !error && (
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-8 text-sm font-medium text-calisto-muted shadow-sm">
          Loading...
        </div>
      )}
      {data && (
        <>
          <section className="mb-5 flex flex-col gap-4 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <input
                id="searchInput"
                className="h-11 min-w-0 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-orange-300 focus:ring-4 focus:ring-calisto-focus lg:w-72"
                type="search"
                placeholder="Search id, name, brand..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                id="typeFilter"
                className="h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none focus:border-orange-300 focus:ring-4 focus:ring-calisto-focus"
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
                className="h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none focus:border-orange-300 focus:ring-4 focus:ring-calisto-focus"
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
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                    <th className="px-7 py-5"></th>
                    <th className="px-7 py-5">ID</th>
                    <th className="px-7 py-5">Product</th>
                    <th className="px-7 py-5">Type</th>
                    <th className="px-7 py-5">Category</th>
                    <th className="px-7 py-5">Price</th>
                    <th className="px-7 py-5">Stock</th>
                    <th className="px-7 py-5">Rating</th>
                    <th className="px-7 py-5 text-right"></th>
                  </tr>
                </thead>
                <tbody id="rows" className="divide-y divide-calisto-line-subtle">
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-7 py-12 text-center text-sm font-medium text-calisto-muted">No products yet. Click "Add Product".</td></tr>
                  )}
                  {filtered.map((product: ProductRecord) => (
                    <tr key={product.productId} className="transition hover:bg-calisto-surface-muted" data-product-id={product.productId}>
                      <td className="px-7 py-4">
                        <div className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-violet-600 text-xs font-bold text-calisto-surface">
                          {product.imageUrl ? (
                            <img className="h-full w-full object-cover" src={product.imageUrl} alt={product.productName} />
                          ) : (
                            <span>{productInitial(product)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-7 py-4 font-mono text-[0.86rem] break-all">{product.productId}</td>
                      <td className="px-7 py-4">
                        <div className="font-semibold text-calisto-ink">{product.productName}</div>
                        <div className="mt-0.5 text-xs text-calisto-muted">{product.brand}</div>
                      </td>
                      <td className="px-7 py-4 text-calisto-body">{product.productType}</td>
                      <td className="px-7 py-4 text-calisto-body">{product.category}</td>
                      <td className="px-7 py-4 font-mono text-[0.86rem]">RM{product.priceMyr.toFixed(2)}</td>
                      <td className="px-7 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider ${stockTone(product.stockStatus)}`}>
                          {product.stockStatus.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-7 py-4 text-calisto-body">{product.rating !== null && product.rating !== undefined ? product.rating.toFixed(1) : '-'}</td>
                      <td className="px-7 py-4 text-right">
                        <button className="px-2 text-sm font-bold text-blue-600 transition hover:text-blue-700" type="button">Edit</button>
                        <button className="ml-2 px-2 text-sm font-bold text-rose-700 transition hover:text-rose-800" type="button">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PageContainer>
  )
}

