import { Download, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import type { ProductImportMode } from '../types'

const requiredColumns = [
  'product_id',
  'product_name',
  'category',
  'product_type',
  'brand',
  'price_myr',
]

const ACCEPTED_EXTENSIONS = '.xlsx,.xls,.csv'

const labelClass = 'mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink'
const fileInputClass = 'block h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 py-1.5 text-sm font-medium text-calisto-body outline-none transition file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-calisto-surface file:px-3 file:text-xs file:font-semibold file:text-calisto-ink hover:file:bg-calisto-surface-muted focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const radioClass = 'h-4 w-4 border-calisto-line text-calisto-accent focus:ring-2 focus:ring-calisto-focus'

interface ImportProductsModalProps {
  importing?: boolean
  onClose: () => void
  onDownloadTemplate: () => void
  onImport: (file: File, duplicateHandling: ProductImportMode) => Promise<void> | void
  open: boolean
}

export default function ImportProductsModal({
  importing = false,
  onClose,
  onDownloadTemplate,
  onImport,
  open,
}: ImportProductsModalProps) {
  const [importFile, setImportFile] = useState<File | null>(null)
  const [duplicateHandling, setDuplicateHandling] = useState<ProductImportMode>('skip')
  const [error, setError] = useState<string | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    setImportFile(null)
    setDuplicateHandling('skip')
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previousFocusRef.current?.focus?.()
    }
  }, [onClose, open])

  function handleOverlayMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!importFile) {
      setError('An XLSX or CSV file is required.')
      return
    }

    try {
      setError(null)
      await onImport(importFile, duplicateHandling)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import products.')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-calisto-ink/50" onMouseDown={handleOverlayMouseDown}>
      <div className="flex min-h-full items-center justify-center px-4 py-8 lg:pl-60 lg:pr-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="importProductsTitle"
          className="w-full max-w-2xl overflow-hidden rounded-3xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-calisto-line px-6 py-5">
            <div>
              <h2 id="importProductsTitle" className="text-lg font-bold text-calisto-ink">Import products from XLSX</h2>
              <p className="mt-1 text-sm leading-6 text-calisto-body">
                Upload an XLSX or CSV file with the same columns as the catalogue export.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface text-calisto-ink transition hover:bg-calisto-surface-muted"
              onClick={onClose}
              aria-label="Close import modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form className="max-h-[75vh] overflow-y-auto px-6 py-5" onSubmit={handleSubmit}>
            <section className="grid gap-4">
              <div className="text-xs font-bold uppercase tracking-wider text-calisto-ink">Required columns</div>
              <div className="flex flex-wrap gap-2">
                {requiredColumns.map((column) => (
                  <span
                    key={column}
                    className="rounded-lg border border-calisto-line bg-calisto-table px-2.5 py-1 text-xs font-semibold text-calisto-body"
                  >
                    {column}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-6 grid gap-3 border-t border-calisto-line-subtle pt-6">
              <div className="text-xs font-bold uppercase tracking-wider text-calisto-ink">Download template</div>
              <Button className="w-fit" icon={<Download className="h-4 w-4" />} onClick={onDownloadTemplate}>
                Download template XLSX
              </Button>
            </section>

            <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
              <div>
                <label className={labelClass} htmlFor="importFile">XLSX or CSV file *</label>
                <input
                  id="importFile"
                  className={fileInputClass}
                  type="file"
                  accept={`${ACCEPTED_EXTENSIONS},application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv`}
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] ?? null)
                    setError(null)
                  }}
                />
                <p className="mt-2 text-xs font-semibold text-calisto-muted">
                  {importFile ? `Selected: ${importFile.name}` : 'Accepted: .xlsx, .csv'}
                </p>
              </div>
            </section>

            <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
              <div className="text-xs font-bold uppercase tracking-wider text-calisto-ink">If product ID already exists</div>
              <div className="grid gap-3">
                <label className="inline-flex items-center gap-3 text-sm font-semibold text-calisto-body">
                  <input
                    className={radioClass}
                    type="radio"
                    name="duplicateHandling"
                    value="skip"
                    checked={duplicateHandling === 'skip'}
                    onChange={() => setDuplicateHandling('skip')}
                  />
                  Skip row
                </label>
                <label className="inline-flex items-center gap-3 text-sm font-semibold text-calisto-body">
                  <input
                    className={radioClass}
                    type="radio"
                    name="duplicateHandling"
                    value="update"
                    checked={duplicateHandling === 'update'}
                    onChange={() => setDuplicateHandling('update')}
                  />
                  Update existing product
                </label>
              </div>
            </section>

            {error && (
              <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-calisto-line pt-5">
              <Button onClick={onClose} disabled={importing}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={importing}>
                {importing ? 'Importing...' : 'Import'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
