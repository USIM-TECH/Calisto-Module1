import { useEffect, useMemo, useState } from 'react'
import { getProducts } from '../api/client'
import type { ProductListResult, ProductRecord } from '../types'

function stockTone(status: string) {
  const s = (status ?? '').toLowerCase()
  if (s === 'in_stock') return 'success'
  if (s === 'low_stock') return 'warning'
  if (s === 'out_of_stock') return 'danger'
  return 'neutral'
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
    <>
      <header className="page-header">
        <div className="page-title">Product Catalogue</div>
        <div className="header-actions">
          <button id="addBtn" className="btn dark" type="button">+ Add Product</button>
        </div>
      </header>
      <div className="page-body">
        <div className="page-inner">
          {error && <div className="card">{error}</div>}
          {!data && !error && <div className="card">Loading...</div>}
          {data && (
            <>
              <section className="toolbar">
                <div className="toolbar-group">
                  <input
                    id="searchInput"
                    type="search"
                    placeholder="Search id, name, brand..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <select id="typeFilter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    <option value="">All product types</option>
                    {productTypes.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                  <select id="brandFilter" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                    <option value="">All brands</option>
                    {brands.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="toolbar-group">
                  <span id="resultCount" style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600 }}>
                    {filtered.length} products
                  </span>
                  <button id="clearFilters" className="btn link" type="button" style={{ color: '#4f46e5', fontWeight: 700 }} onClick={clearFilters}>
                    Clear
                  </button>
                </div>
              </section>

              <section className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>ID</th>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Rating</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="rows">
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="empty-cell">No products yet. Click "Add Product".</td></tr>
                    )}
                    {filtered.map((product: ProductRecord) => (
                      <tr key={product.productId} data-product-id={product.productId}>
                        <td>
                          <div className="thumb">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.productName} />
                            ) : (
                              <span>{productInitial(product)}</span>
                            )}
                          </div>
                        </td>
                        <td className="mono">{product.productId}</td>
                        <td>
                          <div className="cell-strong">{product.productName}</div>
                          <div className="cell-muted">{product.brand}</div>
                        </td>
                        <td>{product.productType}</td>
                        <td>{product.category}</td>
                        <td className="mono">RM{product.priceMyr.toFixed(2)}</td>
                        <td><span className={`pill ${stockTone(product.stockStatus)}`}>{product.stockStatus.replace(/_/g, ' ')}</span></td>
                        <td>{product.rating !== null && product.rating !== undefined ? product.rating.toFixed(1) : '-'}</td>
                        <td className="actions-col">
                          <button className="btn link" type="button">Edit</button>
                          <button className="btn link danger" type="button">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
