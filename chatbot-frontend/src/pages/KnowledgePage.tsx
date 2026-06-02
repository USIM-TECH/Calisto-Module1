import { useEffect, useState } from 'react'
import { getKnowledgePreview, getKnowledgeSummary } from '../api/client'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import Topbar from '../components/Topbar'

interface KnowledgeSource {
  source: string
  count: number
}

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getKnowledgeSummary()
      .then((data) => setSources(data.sources))
      .catch((err) => setError(err.message))
  }, [])

  async function loadPreview(source: string) {
    setSelected(source)
    setPreview('Loading...')
    try {
      const data = await getKnowledgePreview(source)
      const combined = data.items.map((item, index) => `--- chunk ${index + 1} ---\n${item.text || ''}`).join('\n\n')
      setPreview(combined || '(empty)')
    } catch (err: any) {
      setPreview('Failed to load preview')
    }
  }

  return (
    <PageContainer>
      <Topbar
        title="Knowledge base (indexed chunks)"
        actions={(
          <span className="text-sm font-semibold text-calisto-muted">
            {sources.reduce((sum, source) => sum + source.count, 0)} chunks in DB
          </span>
        )}
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}
      <section className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-5 text-sm leading-6 text-calisto-body shadow-sm">
        Chunks are seeded from <code className="rounded bg-calisto-table px-1.5 py-0.5 font-mono text-xs text-calisto-body">calisto_meta.json</code> (same content as PDF/DOCX/CSV in
        <code className="rounded bg-calisto-table px-1.5 py-0.5 font-mono text-xs text-calisto-body"> knowledge_base/</code>). Rasa <code className="rounded bg-calisto-table px-1.5 py-0.5 font-mono text-xs text-calisto-body">action_document_search</code> reads them from
        <code className="rounded bg-calisto-table px-1.5 py-0.5 font-mono text-xs text-calisto-body"> GET /knowledge/chunks</code> when <code className="rounded bg-calisto-table px-1.5 py-0.5 font-mono text-xs text-calisto-body">BACKEND_API_BASE_URL</code> is set.
        Re-run <code className="rounded bg-calisto-table px-1.5 py-0.5 font-mono text-xs text-calisto-body">npm run db:seed:knowledge</code> after regenerating the index JSON.
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
                <th className="px-7 py-5">Source file</th>
                <th className="px-7 py-5">Chunks</th>
                <th className="px-7 py-5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-calisto-line-subtle">
              {sources.length === 0 && (
                <tr><td colSpan={3} className="px-7 py-12 text-center text-sm font-medium text-calisto-muted">No chunks. Run npm run db:seed:knowledge</td></tr>
              )}
              {sources.map((source) => (
                <tr key={source.source} className="transition hover:bg-calisto-surface-muted">
                  <td className="px-7 py-4 font-mono text-[0.86rem] break-all">{source.source}</td>
                  <td className="px-7 py-4 text-calisto-body">{source.count}</td>
                  <td className="px-7 py-4 text-right">
                    <button type="button" className="text-sm font-bold text-blue-600 transition hover:text-blue-700" onClick={() => loadPreview(source.source)}>Preview</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <section id="previewPanel" className="mt-6 overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-calisto-line px-5 py-4">
            <h3 id="previewTitle" className="text-base font-extrabold text-calisto-ink">Preview: {selected}</h3>
            <Button id="closePreview" onClick={() => setSelected(null)}>Close</Button>
          </div>
          <pre id="previewBody" className="max-h-[420px] overflow-auto whitespace-pre-wrap bg-calisto-surface-muted px-5 py-4 text-sm leading-6 text-calisto-body">{preview}</pre>
        </section>
      )}
    </PageContainer>
  )
}

