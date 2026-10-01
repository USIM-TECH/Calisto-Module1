import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from './Button'
import Modal from './Modal'
import RequiredMark from './RequiredMark'
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
const fileInputClass = 'block h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 py-1.5 text-sm font-medium text-calisto-body outline-none transition file:mr-3 file:h-8 file:rounded-lg file:border file:border-solid file:border-calisto-line file:bg-calisto-surface file:px-3 file:text-xs file:font-semibold file:text-calisto-ink hover:file:bg-calisto-surface-muted focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus'
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

  useEffect(() => {
    if (!open) return
    setImportFile(null)
    setDuplicateHandling('skip')
    setError(null)
  }, [open])

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
    <Modal
      description="Upload an XLSX or CSV file with the same columns as the catalogue export."
      dismissible={!importing}
      footer={(
        <>
          <Button onClick={onClose} disabled={importing}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={importing || !importFile}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </>
      )}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="Import products from XLSX"
    >
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
          <label className={labelClass} htmlFor="importFile">XLSX or CSV file<RequiredMark /></label>
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

    </Modal>
  )
}
