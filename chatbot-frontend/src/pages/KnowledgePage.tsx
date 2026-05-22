import { useEffect, useState } from 'react'
import { getKnowledgePreview, getKnowledgeSummary } from '../api/client'

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
    <>
      <header className="page-header">
        <div className="page-title">Knowledge base (indexed chunks)</div>
        <div className="header-actions">
          <span style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600 }}>
            {sources.reduce((sum, source) => sum + source.count, 0)} chunks in DB
          </span>
        </div>
      </header>
      <div className="page-body">
        <div className="page-inner">
          {error && <div className="card">{error}</div>}
          <p style={{ color: '#4b5563', maxWidth: 720, lineHeight: 1.55 }}>
            Chunks are seeded from <code>calisto_meta.json</code> (same content as PDF/DOCX/CSV in
            <code> knowledge_base/</code>). Rasa <code>action_document_search</code> reads them from
            <code> GET /knowledge/chunks</code> when <code>BACKEND_API_BASE_URL</code> is set.
            Re-run <code>npm run db:seed:knowledge</code> after regenerating the index JSON.
          </p>
          <section className="table-card" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead>
                <tr><th>Source file</th><th>Chunks</th><th></th></tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr><td colSpan={3} className="empty-cell">No chunks. Run npm run db:seed:knowledge</td></tr>
                )}
                {sources.map((source) => (
                  <tr key={source.source}>
                    <td className="mono">{source.source}</td>
                    <td>{source.count}</td>
                    <td><button type="button" className="btn link preview-btn" onClick={() => loadPreview(source.source)}>Preview</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {selected && (
            <section id="previewPanel" className="preview-panel">
              <div className="preview-head">
                <h3 id="previewTitle">Preview: {selected}</h3>
                <button type="button" id="closePreview" className="btn" onClick={() => setSelected(null)}>Close</button>
              </div>
              <pre id="previewBody" className="preview-body">{preview}</pre>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
