import { renderAppShell } from './leads-dashboard.js'

function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderKnowledgeAdminHtml({
  summary,
}: {
  summary: Array<{ source: string; count: number }>
}): string {
  const total = summary.reduce((a, s) => a + s.count, 0)
  const rows = summary
    .map(
      (s) => `
      <tr>
        <td class="mono">${escapeHtml(s.source)}</td>
        <td>${s.count}</td>
        <td><button type="button" class="btn link preview-btn" data-source="${escapeHtml(s.source)}">Preview</button></td>
      </tr>`,
    )
    .join('')

  const content = `
    <main class="page">
      <header class="page-header">
        <div class="page-title">Knowledge base (indexed chunks)</div>
        <div class="header-actions">
          <span style="color:#6b7280;font-size:0.9rem;font-weight:600;">${total} chunks in DB</span>
        </div>
      </header>
      <div class="page-body">
        <div class="page-inner">
          <p style="color:#4b5563;max-width:720px;line-height:1.55;">
            Chunks are seeded from <code>calisto_meta.json</code> (same content as PDF/DOCX/CSV in
            <code>knowledge_base/</code>). Rasa <code>action_document_search</code> reads them from
            <code>GET /knowledge/chunks</code> when <code>BACKEND_API_BASE_URL</code> is set.
            Re-run <code>npm run db:seed:knowledge</code> after regenerating the index JSON.
          </p>
          <section class="table-card" style="margin-top:20px;">
            <table class="data-table">
              <thead>
                <tr><th>Source file</th><th>Chunks</th><th></th></tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="3" class="empty-cell">No chunks. Run npm run db:seed:knowledge</td></tr>'}</tbody>
            </table>
          </section>
          <section id="previewPanel" class="preview-panel" hidden>
            <div class="preview-head">
              <h3 id="previewTitle">Preview</h3>
              <button type="button" id="closePreview" class="btn">Close</button>
            </div>
            <pre id="previewBody" class="preview-body"></pre>
          </section>
        </div>
      </div>
    </main>
    <style>
      .table-card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
      .data-table thead th { text-align: left; font-weight: 700; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; padding: 14px 16px; background: #fafafa; border-bottom: 1px solid var(--line); }
      .data-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
      .data-table tbody tr:last-child td { border-bottom: 0; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.84rem; word-break: break-all; }
      .empty-cell { padding: 32px; text-align: center; color: var(--muted); }
      .btn.link { border: 0; background: transparent; color: #2563eb; font-weight: 700; cursor: pointer; padding: 4px 8px; }
      .preview-panel { margin-top: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); padding: 0; overflow: hidden; }
      .preview-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); }
      .preview-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
      .preview-body { margin: 0; padding: 16px 18px; max-height: 420px; overflow: auto; white-space: pre-wrap; font-size: 0.82rem; line-height: 1.5; color: #374151; background: #fafafa; }
    </style>
    <script>
      (function() {
        const panel = document.getElementById('previewPanel');
        const body = document.getElementById('previewBody');
        const title = document.getElementById('previewTitle');
        const closeBtn = document.getElementById('closePreview');
        document.querySelectorAll('.preview-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const source = btn.getAttribute('data-source');
            title.textContent = 'Preview: ' + source;
            body.textContent = 'Loading…';
            panel.hidden = false;
            const res = await fetch('/admin/knowledge/api?source=' + encodeURIComponent(source) + '&limit=5');
            const data = await res.json();
            const parts = (data.items || []).map((row, i) => '--- chunk ' + (i+1) + ' ---' + String.fromCharCode(10) + (row.text || ''));
            body.textContent = parts.join(String.fromCharCode(10) + String.fromCharCode(10)) || '(empty)';
          });
        });
        closeBtn.addEventListener('click', () => { panel.hidden = true; });
      })();
    </script>
  `

  return renderAppShell('Knowledge base', content, 'knowledge')
}
