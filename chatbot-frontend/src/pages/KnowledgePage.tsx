import { Eye, Pencil, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  getKnowledgeDocuments,
  updateKnowledgeDocument,
} from '../api/client'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import { SkeletonBlock, SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import type { KnowledgeDocumentSummary } from '../types'

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function documentTextFromItems(items: Array<{ text: string }>) {
  return items.map((item) => item.text || '').filter(Boolean).join('\n\n')
}

const labelClass = 'mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink'
const inputClass = 'h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const fileInputClass = 'block h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 py-1.5 text-sm font-medium text-calisto-body outline-none transition file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-calisto-surface file:px-3 file:text-xs file:font-semibold file:text-calisto-ink hover:file:bg-calisto-surface-muted focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const textareaClass = 'min-h-[280px] w-full resize-y rounded-xl border border-calisto-line bg-calisto-table p-4 text-sm font-medium leading-6 text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const errorClass = 'mt-1 text-xs font-semibold text-rose-600'

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
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
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

  const totalChunks = documents.reduce((sum, document) => sum + document.chunkCount, 0)

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
    if (!addFile && !addText.trim()) nextErrors.content = 'Upload a file or paste text content.'
    setAddErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setAdding(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await createKnowledgeDocument({
        file: addFile,
        source: addSource,
        text: addText,
        title: addTitle,
      })
      await loadDocuments()
      setSuccessMessage(`Added ${result.source}.`)
      closeAddModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add document.')
    } finally {
      setAdding(false)
    }
  }

  async function loadPreview(source: string) {
    setSelected(source)
    setPreview('__loading__')
    setError(null)
    setSuccessMessage(null)
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
    setEditText('__loading__')
    setEditFile(null)
    setError(null)
    setSuccessMessage(null)
    try {
      const data = await getKnowledgeDocument(source, 200)
      setEditText(documentTextFromItems(data.items))
    } catch (err) {
      setEditText('')
      setError(err instanceof Error ? err.message : 'Failed to load document for editing.')
    }
  }

  async function saveEdit() {
    if (!editingSource) return
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await updateKnowledgeDocument(editingSource, { file: editFile, text: editText, title: editTitle })
      await loadDocuments()
      setSuccessMessage(`Updated ${editingSource}.`)
      setEditingSource(null)
      setEditFile(null)
      if (selected === editingSource) {
        setSelected(null)
        setPreview('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update document.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDocument(source: string) {
    if (!window.confirm(`Delete ${source}? This cannot be undone.`)) return
    setDeletingSource(source)
    setError(null)
    setSuccessMessage(null)
    try {
      await deleteKnowledgeDocument(source)
      await loadDocuments()
      setSuccessMessage(`Deleted ${source}.`)
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
      setError(err instanceof Error ? err.message : 'Failed to delete document.')
    } finally {
      setDeletingSource(null)
    }
  }

  return (
    <PageContainer>
      <Topbar
        title="Documents"
        actions={(
          <>
            <span className="text-sm font-semibold text-calisto-muted">
              {totalChunks} chunks in DB
            </span>
            <Button onClick={() => setIsAddOpen(true)} variant="primary">+ Add Document</Button>
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


      <section className="mt-5 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-calisto-soft" />
            <input
              className="h-11 w-full rounded-lg border border-transparent bg-calisto-table pl-10 pr-4 text-sm text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/30 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
              onChange={(event) => setFilter(event.target.value)}
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

      <section className="mt-5 overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[50%]" />
              <col className="w-[12%]" />
              <col className="w-[23%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                <th className="px-7 py-5">Document Title</th>
                <th className="px-7 py-5">Chunks</th>
                <th className="px-7 py-5">Updated</th>
                <th className="px-7 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-calisto-line-subtle">
              {filteredDocuments.length === 0 && (
                <tr><td colSpan={4} className="px-7 py-12 text-center text-sm font-medium text-calisto-muted">No documents match these filters.</td></tr>
              )}
              {filteredDocuments.map((document) => (
                <tr key={document.source} className="transition hover:bg-calisto-surface-muted">
                  <td className="px-7 py-4 font-semibold text-calisto-ink">
                    {document.title || document.source}
                    {document.title && (
                      <span className="block font-mono text-[0.7rem] font-medium text-calisto-muted mt-0.5">{document.source}</span>
                    )}
                  </td>
                  <td className="px-7 py-4 text-calisto-body">{document.chunkCount}</td>
                  <td className="px-7 py-4 text-calisto-body">{formatDate(document.updatedAt)}</td>
                  <td className="px-7 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        aria-label={`Preview ${document.source}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-calisto-accent transition hover:bg-blue-50"
                        onClick={() => loadPreview(document.source)}
                        title="Preview"
                        type="button"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Edit ${document.source}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                        onClick={() => openEdit(document.source)}
                        title="Edit"
                        type="button"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button
                        aria-label={`Delete ${document.source}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-100 bg-calisto-surface text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>
      </section>

      {editingSource && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-calisto-ink/50">
          <div className="flex min-h-full items-center justify-center px-4 py-8 lg:pl-60 lg:pr-0">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="editKnowledgeTitle"
              className="w-full max-w-3xl overflow-hidden rounded-3xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard"
            >
              <div className="flex items-start justify-between gap-4 border-b border-calisto-line px-6 py-5">
                <h2 id="editKnowledgeTitle" className="text-lg font-bold text-calisto-ink">Edit document</h2>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface text-calisto-ink transition hover:bg-calisto-surface-muted"
                  onClick={() => setEditingSource(null)}
                  aria-label="Close edit document modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
                <div>
                  <label className={labelClass} htmlFor="knowledgeSource">
                    Source filename *
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
                      className={textareaClass}
                      onChange={(event) => setEditText(event.target.value)}
                      value={editText}
                    />
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-calisto-line pt-5">
                  <Button disabled={saving} onClick={() => setEditingSource(null)}>Cancel</Button>
                  <Button disabled={saving} onClick={saveEdit} variant="primary">{saving ? 'Saving...' : 'Save'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-calisto-ink/50" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeAddModal()
        }}>
          <div className="flex min-h-full items-center justify-center px-4 py-8 lg:pl-60 lg:pr-0">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="addKnowledgeTitle"
              className="w-full max-w-3xl overflow-hidden rounded-3xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-calisto-line px-6 py-5">
                <h2 id="addKnowledgeTitle" className="text-lg font-bold text-calisto-ink">Add Document</h2>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface text-calisto-ink transition hover:bg-calisto-surface-muted"
                  onClick={closeAddModal}
                  aria-label="Close add document modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
                <div>
                  <label className={labelClass} htmlFor="addKnowledgeSource">Source filename *</label>
                  <input
                    id="addKnowledgeSource"
                    className={inputClass}
                    onChange={(event) => {
                      setAddSource(event.target.value)
                      setAddErrors((prev) => ({ ...prev, source: undefined }))
                    }}
                    placeholder="faq_customer_support.docx"
                    type="text"
                    value={addSource}
                  />
                  {addErrors.source && <p className={errorClass}>{addErrors.source}</p>}
                  <p className="mt-2 text-xs font-semibold text-calisto-muted">Basename only (no folders)</p>
                </div>

                <div className="mt-5">
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
                    className={textareaClass}
                    onChange={(event) => {
                      setAddText(event.target.value)
                      setAddErrors((prev) => ({ ...prev, content: undefined }))
                    }}
                    placeholder="Paste document text here..."
                    value={addText}
                  />
                  {addErrors.content && <p className={errorClass}>{addErrors.content}</p>}
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-calisto-line pt-5">
                  <Button disabled={adding} onClick={closeAddModal}>Cancel</Button>
                  <Button disabled={adding} onClick={saveAdd} variant="primary">{adding ? 'Saving...' : 'Save'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <section id="previewPanel" className="mt-6 overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-calisto-line px-5 py-4">
            <h3 id="previewTitle" className="text-base font-extrabold text-calisto-ink">Preview: {selected}</h3>
            <Button id="closePreview" onClick={() => setSelected(null)}>Close</Button>
          </div>
          {preview === '__loading__' ? (
            <div className="space-y-3 px-5 py-5">
              {[...Array(6)].map((_, i) => (
                <SkeletonBlock key={i} className={`h-4 ${i % 3 === 2 ? 'w-3/5' : 'w-full'}`} />
              ))}
            </div>
          ) : (
            <pre id="previewBody" className="max-h-[420px] overflow-auto whitespace-pre-wrap bg-calisto-surface-muted px-5 py-4 text-sm leading-6 text-calisto-body">{preview}</pre>
          )}
        </section>
      )}
    </PageContainer>
  )
}

