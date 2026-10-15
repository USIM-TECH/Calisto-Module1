import { Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  getKnowledgeDocuments,
  updateKnowledgeDocument,
} from '../api/client'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import PageContainer from '../components/PageContainer'
import Modal from '../components/Modal'
import RequiredMark from '../components/RequiredMark'
import Pagination from '../components/Pagination'
import { SkeletonBlock, SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import { useSnackbar } from '../components/Snackbar'
import type { KnowledgeDocumentSummary } from '../types'
import { pageSlice, useTablePaging } from '../lib/table-paging'

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function documentTextFromItems(items: Array<{ text: string }>) {
  return items.map((item) => item.text || '').filter(Boolean).join('\n\n')
}

// Fixed one-line row height; rows per page = fit the screen, or the size picked in the footer (useTablePaging).
const ROW_HEIGHT_PX = 64

const labelClass = 'mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink'
const inputClass = 'h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus'
const fileInputClass = 'block h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 py-1.5 text-sm font-medium text-calisto-body outline-none transition file:mr-3 file:h-8 file:rounded-lg file:border file:border-solid file:border-calisto-line file:bg-calisto-surface file:px-3 file:text-xs file:font-semibold file:text-calisto-ink hover:file:bg-calisto-surface-muted focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus'
const textareaClass = 'min-h-[280px] w-full resize-y rounded-xl border border-calisto-line bg-calisto-surface p-4 text-sm font-medium leading-6 text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus'
const errorClass = 'mt-1 text-xs font-semibold text-rose-600'
const withError = (className: string, hasError: boolean) => (hasError ? className.replace('border-calisto-line', 'border-rose-400') : className)
const CONTENT_REQUIRED = 'Upload a file or paste text content.'

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addSource, setAddSource] = useState('')
  const [addText, setAddText] = useState('')
  const [addFile, setAddFile] = useState<File | null>(null)
  const [addErrors, setAddErrors] = useState<{ source?: string; content?: string }>({})
  const [editingSource, setEditingSource] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)
  const [editContentTouched, setEditContentTouched] = useState(false)
  const [filter, setFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const snackbar = useSnackbar()
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingSource, setDeletingSource] = useState<string | null>(null)
  const [addTitle, setAddTitle] = useState('')
  const [editTitle, setEditTitle] = useState('')

  function loadDocuments() {
    return getKnowledgeDocuments()
      .then((data) => {
        setDocuments(data.documents)
        setDocsLoading(false)
      })
      .catch((err) => {
        setDocsLoading(false)
        setError(err instanceof Error ? err.message : 'Failed to load documents.')
      })
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  const filteredDocuments = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return documents
    return documents.filter((document) => 
      document.source.toLowerCase().includes(term) ||
      (document.title && document.title.toLowerCase().includes(term))
    )
  }, [documents, filter])

  const paging = useTablePaging(tableHeaderRef, !docsLoading)
  const rowsPerPage = paging.rowsPerPage
  const { pageCount, currentPage: shownPage, pageItems, visibleStart, visibleEnd } = pageSlice(filteredDocuments, rowsPerPage, currentPage)

  function closeAddModal() {
    setIsAddOpen(false)
    setAddSource('')
    setAddText('')
    setAddFile(null)
    setAddTitle('')
    setAddErrors({})
  }

  async function saveAdd() {
    const nextErrors: { source?: string; content?: string } = {}
    if (!addSource.trim()) nextErrors.source = 'Source filename is required.'
    if (!addFile && !addText.trim()) nextErrors.content = CONTENT_REQUIRED
    setAddErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setAdding(true)
    try {
      const result = await createKnowledgeDocument({
        file: addFile,
        source: addSource,
        text: addText,
        title: addTitle,
      })
      await loadDocuments()
      snackbar.success(`Added ${result.source}.`)
      closeAddModal()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to add document.')
    } finally {
      setAdding(false)
    }
  }

  async function loadPreview(source: string) {
    setSelected(source)
    setPreview('__loading__')
    try {
      const data = await getKnowledgeDocument(source, 200)
      const combined = data.items
        .map((item, index) => `--- chunk ${index + 1} ---\n${item.text || ''}`)
        .join('\n\n')
      setPreview(combined || '(empty)')
    } catch {
      setPreview('Failed to load preview')
    }
  }

  async function openEdit(source: string) {
    const doc = documents.find((d) => d.source === source)
    setEditTitle(doc?.title ?? '')
    setEditingSource(source)
    setEditContentTouched(false)
    setEditText('__loading__')
    setEditFile(null)
    try {
      const data = await getKnowledgeDocument(source, 200)
      setEditText(documentTextFromItems(data.items))
    } catch (err) {
      setEditText('')
      snackbar.error(err instanceof Error ? err.message : 'Failed to load document for editing.')
    }
  }

  async function saveEdit() {
    if (!editingSource) return
    setSaving(true)
    try {
      await updateKnowledgeDocument(editingSource, { file: editFile, text: editText, title: editTitle })
      await loadDocuments()
      snackbar.success(`Updated ${editingSource}.`)
      setEditingSource(null)
      setEditFile(null)
      if (selected === editingSource) {
        setSelected(null)
        setPreview('')
      }
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to update document.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDocument(source: string) {
    if (!window.confirm(`Delete ${source}? This cannot be undone.`)) return
    setDeletingSource(source)
    try {
      await deleteKnowledgeDocument(source)
      await loadDocuments()
      snackbar.success(`Deleted ${source}.`)
      if (selected === source) {
        setSelected(null)
        setPreview('')
      }
      if (editingSource === source) {
        setEditingSource(null)
        setEditText('')
        setEditFile(null)
      }
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to delete document.')
    } finally {
      setDeletingSource(null)
    }
  }

  return (
    // On desktop the page fills the screen; the table takes the remaining height and pages.
    <PageContainer className="lg:flex lg:h-[100dvh] lg:flex-col">
      <Topbar
        title="Documents"
        actions={(
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsAddOpen(true)} variant="primary">Add Document</Button>
        )}
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {docsLoading && (
        <>
          <SkeletonTopbar />
          <SkeletonTable
            cols={4}
            rows={5}
            headers={['Source file', 'Chunks', 'Updated', 'Actions']}
          />
        </>
      )}


      <section className="rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-calisto-soft" />
            <input
              className="h-11 w-full rounded-lg border border-calisto-line bg-calisto-surface pl-10 pr-4 text-sm text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/30 focus:ring-4 focus:ring-calisto-focus"
              onChange={(event) => {
                setFilter(event.target.value)
                setCurrentPage(1)
              }}
              placeholder="Filter by source file..."
              type="search"
              value={filter}
            />
          </label>                        
          {filter && (
            <Button className="px-3" icon={<X className="h-4 w-4" />} onClick={() => setFilter('')} variant="ghost">
              Clear
            </Button>
          )}
        </div>
      </section>

      <section className="mt-5 flex flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard lg:min-h-0 lg:flex-1">
        <div className="table-scroll flex flex-col overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto" {...paging.scrollProps}>
          <table className="table-edges w-full min-w-[820px] table-fixed border-collapse text-left text-sm lg:min-w-0">
            <colgroup>
              <col className="w-[47%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-calisto-surface" ref={tableHeaderRef}>
              <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                <th className="px-5 py-4">Document Title</th>
                <th className="px-5 py-4">Chunks</th>
                <th className="px-5 py-4">Updated</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-calisto-line-subtle">
              {pageItems.map((document) => (
                <tr key={document.source} className="border-b border-calisto-line-subtle transition hover:bg-calisto-surface-muted" style={{ height: ROW_HEIGHT_PX }}>
                  <td className="px-5 py-2 font-semibold text-calisto-ink" title={document.title ? `${document.title} (${document.source})` : document.source}>
                    <span className="block truncate">{document.title || document.source}</span>
                    {document.title && (
                      <span className="mt-0.5 block truncate text-xs font-medium text-calisto-muted">{document.source}</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-calisto-body">{document.chunkCount}</td>
                  <td className="truncate px-5 py-2 text-calisto-body">{formatDate(document.updatedAt)}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center justify-start gap-2">
                      <button
                        aria-label={`Preview ${document.source}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-calisto-accent transition hover:bg-blue-50"
                        onClick={() => loadPreview(document.source)}
                        title="Preview"
                        type="button"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Edit ${document.source}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                        onClick={() => openEdit(document.source)}
                        title="Edit"
                        type="button"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button
                        aria-label={`Delete ${document.source}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-calisto-surface text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={deletingSource === document.source}
                        onClick={() => deleteDocument(document.source)}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!docsLoading && filteredDocuments.length === 0 && <EmptyState />}
        </div>
        {filteredDocuments.length > 0 && (
          <Pagination
            {...paging.pagination}
            currentPage={shownPage}
            onNextPage={() => setCurrentPage(shownPage + 1)}
            onPreviousPage={() => setCurrentPage(shownPage - 1)}
            pageCount={pageCount}
            totalCount={filteredDocuments.length}
            visibleEnd={visibleEnd}
            visibleStart={visibleStart}
          />
        )}
      </section>

      {editingSource && (
        <Modal
          dismissible={!saving}
          footer={(
            <>
              <Button disabled={saving} onClick={() => setEditingSource(null)}>Cancel</Button>
              <Button disabled={saving || editText === '__loading__' || (!editFile && !editText.trim())} onClick={saveEdit} variant="primary">{saving ? 'Saving...' : 'Save'}</Button>
            </>
          )}
          onClose={() => setEditingSource(null)}
          size="xl"
          title="Edit document"
        >
          <div>
            <label className={labelClass} htmlFor="knowledgeTitle">
              Title of the Document
            </label>
            <input
              id="knowledgeTitle"
              className={inputClass}
              type="text"
              placeholder="Enter a descriptive title for this document"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </div>

          <div className="mt-5">
            <label className={labelClass} htmlFor="knowledgeSource">
              Source filename<RequiredMark />
            </label>
            <input
              id="knowledgeSource"
              className={inputClass}
              readOnly
              type="text"
              value={editingSource}
            />
            <p className="mt-2 text-xs font-semibold text-calisto-muted">Basename only (no folders)</p>
          </div>

          <div className="mt-5">
            <label className={labelClass} htmlFor="knowledgeFile">
              Upload file (PDF, DOCX, or TXT - max 5 MB)
            </label>
            <input
              id="knowledgeFile"
              className={fileInputClass}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => setEditFile(event.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-xs font-semibold text-calisto-muted">
              {editFile ? `Selected: ${editFile.name}` : 'No file chosen'}
            </p>
          </div>

          <div className="my-5 text-center text-sm font-semibold text-calisto-muted">- or paste text below -</div>

          <div>
            <label className={labelClass} htmlFor="knowledgeText">
              Text content
            </label>
            {editText === '__loading__' ? (
              <div className="space-y-3 rounded-xl border border-calisto-line bg-calisto-table p-4">
                {[...Array(8)].map((_, i) => (
                  <SkeletonBlock key={i} className={`h-4 ${i % 4 === 3 ? 'w-2/5' : 'w-full'}`} />
                ))}
              </div>
            ) : (
              <textarea
                id="knowledgeText"
                className={withError(textareaClass, editContentTouched && !editFile && !editText.trim())}
                onChange={(event) => setEditText(event.target.value)}
                onBlur={() => setEditContentTouched(true)}
                value={editText}
              />
            )}
            {editContentTouched && !editFile && editText !== '__loading__' && !editText.trim() && (
              <p className={errorClass}>{CONTENT_REQUIRED}</p>
            )}
          </div>
        </Modal>
      )}

      {isAddOpen && (
        <Modal
          dismissible={!adding}
          footer={(
            <>
              <Button disabled={adding} onClick={closeAddModal}>Cancel</Button>
              <Button disabled={adding || !addSource.trim() || (!addFile && !addText.trim())} onClick={saveAdd} variant="primary">{adding ? 'Saving...' : 'Save'}</Button>
            </>
          )}
          onClose={closeAddModal}
          size="xl"
          title="Add Document"
        >
          <div>
            <label className={labelClass} htmlFor="addKnowledgeTitle">Title of the Document</label>
            <input
              id="addKnowledgeTitle"
              className={inputClass}
              onChange={(event) => setAddTitle(event.target.value)}
              placeholder="e.g. FAQ / Customer Support, Company Profile"
              type="text"
              value={addTitle}
            />
          </div>

          <div className="mt-5">
            <label className={labelClass} htmlFor="addKnowledgeSource">Source filename<RequiredMark /></label>
            <input
              id="addKnowledgeSource"
              className={withError(inputClass, Boolean(addErrors.source))}
              onChange={(event) => {
                setAddSource(event.target.value)
                setAddErrors((prev) => ({ ...prev, source: undefined }))
              }}
              onBlur={() => {
                if (!addSource.trim()) setAddErrors((prev) => ({ ...prev, source: 'Source filename is required.' }))
              }}
              placeholder="faq_customer_support.docx"
              type="text"
              value={addSource}
            />
            {addErrors.source && <p className={errorClass}>{addErrors.source}</p>}
            <p className="mt-2 text-xs font-semibold text-calisto-muted">Basename only (no folders)</p>
          </div>

          <div className="mt-5">
            <label className={labelClass} htmlFor="addKnowledgeFile">
              Upload file (PDF, DOCX, or TXT - max 5 MB)
            </label>
            <input
              id="addKnowledgeFile"
              className={fileInputClass}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => {
                setAddFile(event.target.files?.[0] ?? null)
                setAddErrors((prev) => ({ ...prev, content: undefined }))
              }}
            />
            <p className="mt-2 text-xs font-semibold text-calisto-muted">
              {addFile ? `Selected: ${addFile.name}` : 'No file chosen'}
            </p>
          </div>

          <div className="my-5 text-center text-sm font-semibold text-calisto-muted">- or paste text below -</div>

          <div>
            <label className={labelClass} htmlFor="addKnowledgeText">Text content</label>
            <textarea
              id="addKnowledgeText"
              className={withError(textareaClass, Boolean(addErrors.content))}
              onChange={(event) => {
                setAddText(event.target.value)
                setAddErrors((prev) => ({ ...prev, content: undefined }))
              }}
              onBlur={() => {
                if (!addFile && !addText.trim()) setAddErrors((prev) => ({ ...prev, content: CONTENT_REQUIRED }))
              }}
              placeholder="Paste document text here..."
              value={addText}
            />
            {addErrors.content && <p className={errorClass}>{addErrors.content}</p>}
          </div>
        </Modal>
      )}

      {/* Shown as a dialog so the page itself keeps fitting the screen. */}
      {selected && (
        <Modal onClose={() => setSelected(null)} size="xl" title={`Preview: ${selected}`}>
          {preview === '__loading__' ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <SkeletonBlock key={i} className={`h-4 ${i % 3 === 2 ? 'w-3/5' : 'w-full'}`} />
              ))}
            </div>
          ) : (
            <pre id="previewBody" className="whitespace-pre-wrap rounded-xl bg-calisto-surface-muted px-4 py-3 text-sm leading-6 text-calisto-body">{preview}</pre>
          )}
        </Modal>
      )}
    </PageContainer>
  )
}

