/** Badge colours and wording for a product's stock status, shared by the product tables. */
export function stockTone(status: string) {
  const s = (status ?? '').toLowerCase()
  if (s === 'in_stock') return 'bg-emerald-100 text-emerald-700'
  if (s === 'low_stock') return 'bg-amber-100 text-amber-700'
  if (s === 'out_of_stock') return 'bg-rose-100 text-rose-700'
  return 'bg-calisto-table text-calisto-body'
}

export function formatStockStatus(status: string) {
  return status.replace(/_/g, ' ')
}
