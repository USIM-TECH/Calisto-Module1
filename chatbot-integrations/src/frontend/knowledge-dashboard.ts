import { renderAppShell } from './leads-dashboard.js'
import type { KnowledgeDocumentSummary } from '../knowledge/types.js'

function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function renderRow(doc: KnowledgeDocumentSummary): string {
  const search = doc.source.toLowerCase()
  return `
    <tr data-source="${escapeHtml(doc.source)}" data-search="${escapeHtml(search)}">
      <td class="mono">${escapeHtml(doc.source)}</td>
      <td>${doc.chunkCount}</td>
      <td>${escapeHtml(formatDate(doc.updatedAt))}</td>
      <td class="actions-col">
        <button class="btn link" type="button" data-action="preview">Preview</button>
        <button class="btn link" type="button" data-action="edit">Edit</button>
        <button class="btn link danger" type="button" data-action="delete">Delete</button>
      </td>
    </tr>`
}

export function renderKnowledgeAdminHtml({
  documents,
}: {
  documents: KnowledgeDocumentSummary[]
}): string {
  const totalChunks = documents.reduce((a, d) => a + d.chunkCount, 0)
  const rows = documents.map(renderRow).join('')

  const content = `
    <main class="page">
      <header class="page-header">
        <div class="page-title">Knowledge base</div>
        <div class="header-actions">
          <span style="color:#6b7280;font-size:0.9rem;font-weight:600;">${documents.length} documents · ${totalChunks} chunks</span>
          <button id="addBtn" class="btn dark" type="button">+ Add document</button>
        </div>
      </header>
      <div class="page-body">
        <div class="page-inner">
          <p style="color:#4b5563;max-width:720px;line-height:1.55;margin:0 0 16px;">
            Upload or paste content to index chunks in Postgres. Rasa reads them from
            <code>GET /knowledge/chunks</code> when <code>BACKEND_API_BASE_URL</code> is set.
          </p>
          <section class="toolbar">
            <div class="toolbar-group">
              <input id="searchInput" type="search" placeholder="Search by filename..." />
            </div>
          </section>

          <section class="table-card">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Chunks</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="rows">
                ${rows || '<tr><td colspan="4" class="empty-cell">No documents yet. Click "+ Add document".</td></tr>'}
              </tbody>
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

    <div id="modalBackdrop" class="modal-backdrop" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onclick="event.stopPropagation()">
        <header class="modal-head">
          <h2 id="modalTitle">Add document</h2>
          <button type="button" id="closeModal" class="btn link" aria-label="Close">x</button>
        </header>
        <form id="docForm" class="modal-form" enctype="multipart/form-data">
          <label>Source filename *
            <input name="source" id="field-source" required placeholder="faq_customer_support.docx" />
            <span class="hint">Basename only (no folders)</span>
          </label>
          <label>Upload file (PDF, DOCX, or TXT — max 5 MB)
            <input name="file" type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          </label>
          <p class="or-divider">— or paste text below —</p>
          <label class="full">Text content
            <textarea name="text" id="field-text" rows="12" placeholder="Paste document text here..."></textarea>
          </label>
          <div id="formError" class="form-error" hidden></div>
          <div class="modal-actions">
            <button type="button" id="cancelBtn" class="btn">Cancel</button>
            <button type="submit" id="submitBtn" class="btn dark">Save</button>
          </div>
        </form>
      </div>
    </div>

    <style>
      .table-card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
      .data-table thead th { text-align: left; font-weight: 700; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; padding: 14px 16px; background: #fafafa; border-bottom: 1px solid var(--line); }
      .data-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
      .data-table tbody tr:last-child td { border-bottom: 0; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.84rem; word-break: break-all; }
      .empty-cell { padding: 32px; text-align: center; color: var(--muted); }
      .actions-col { text-align: right; white-space: nowrap; }
      .actions-col .btn.link { color: #2563eb; font-weight: 700; padding: 4px 8px; }
      .actions-col .btn.link.danger { color: var(--danger-text); margin-left: 6px; }
      .preview-panel { margin-top: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); padding: 0; overflow: hidden; }
      .preview-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); }
      .preview-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
      .preview-body { margin: 0; padding: 16px 18px; max-height: 420px; overflow: auto; white-space: pre-wrap; font-size: 0.82rem; line-height: 1.5; color: #374151; background: #fafafa; }
      .modal-backdrop { position: fixed; inset: 0; background: rgba(17, 24, 39, 0.45); display: none; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 50; }
      .modal-backdrop.is-open { display: flex; }
      .modal { background: var(--panel); width: 100%; max-width: 640px; border-radius: 16px; box-shadow: 0 20px 60px rgba(17, 24, 39, 0.2); overflow: hidden; }
      .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line); }
      .modal-head h2 { margin: 0; font-size: 1.1rem; font-weight: 800; }
      .modal-form { padding: 18px 22px 22px; display: grid; gap: 14px; }
      .modal-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; color: #374151; font-weight: 600; }
      .modal-form label.full { grid-column: 1 / -1; }
      .modal-form input, .modal-form textarea { font: inherit; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: #fff; color: #111827; }
      .hint { color: #9ca3af; font-weight: 500; font-size: 0.78rem; }
      .or-divider { text-align: center; color: #9ca3af; font-size: 0.82rem; margin: 0; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
      .form-error { color: var(--danger-text); background: var(--danger); border-radius: 10px; padding: 10px 12px; font-size: 0.85rem; font-weight: 600; }
    </style>

    <script>
      (function() {
        const rowsEl = document.getElementById('rows');
        const searchInput = document.getElementById('searchInput');
        const addBtn = document.getElementById('addBtn');
        const backdrop = document.getElementById('modalBackdrop');
        const closeModalBtn = document.getElementById('closeModal');
        const cancelBtn = document.getElementById('cancelBtn');
        const form = document.getElementById('docForm');
        const submitBtn = document.getElementById('submitBtn');
        const errorBox = document.getElementById('formError');
        const modalTitle = document.getElementById('modalTitle');
        const sourceField = document.getElementById('field-source');
        const textField = document.getElementById('field-text');
        const previewPanel = document.getElementById('previewPanel');
        const previewTitle = document.getElementById('previewTitle');
        const previewBody = document.getElementById('previewBody');
        const closePreview = document.getElementById('closePreview');

        let editingSource = null;
        const CHUNK_SEP = '\\n\\n---\\n\\n';

        function documentTextFromItems(items) {
          return (items || []).map((row) => row.text || '').filter(Boolean).join(CHUNK_SEP);
        }

        const ALLOWED_UPLOAD = /\\.(pdf|docx|txt)$/i;

        function assertAllowedUpload(file) {
          if (!file || !ALLOWED_UPLOAD.test(file.name)) {
            throw new Error('Only PDF, DOCX, and TXT files can be uploaded.');
          }
        }

        searchInput.addEventListener('input', () => {
          const q = (searchInput.value || '').trim().toLowerCase();
          rowsEl.querySelectorAll('tr[data-source]').forEach((row) => {
            row.style.display = !q || (row.dataset.search || '').includes(q) ? '' : 'none';
          });
        });

        function openModal(source) {
          form.reset();
          errorBox.hidden = true;
          if (source) {
            editingSource = source;
            modalTitle.textContent = 'Edit document';
            sourceField.value = source;
            sourceField.readOnly = true;
            textField.value = 'Loading…';
            backdrop.classList.add('is-open');
            backdrop.setAttribute('aria-hidden', 'false');
            fetch('/admin/knowledge/api/documents/' + encodeURIComponent(source) + '?limit=500')
              .then((r) => r.json())
              .then((data) => {
                textField.value = documentTextFromItems(data.items);
              })
              .catch(() => { textField.value = ''; alert('Failed to load document'); });
          } else {
            editingSource = null;
            modalTitle.textContent = 'Add document';
            sourceField.readOnly = false;
            backdrop.classList.add('is-open');
            backdrop.setAttribute('aria-hidden', 'false');
          }
        }

        function closeModalNow() {
          backdrop.classList.remove('is-open');
          backdrop.setAttribute('aria-hidden', 'true');
        }

        addBtn.addEventListener('click', () => openModal(null));
        closeModalBtn.addEventListener('click', closeModalNow);
        cancelBtn.addEventListener('click', closeModalNow);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalNow(); });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeModalNow();
        });

        closePreview.addEventListener('click', () => { previewPanel.hidden = true; });

        rowsEl.addEventListener('click', async (e) => {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          const action = target.dataset.action;
          if (!action) return;
          const tr = target.closest('tr[data-source]');
          if (!tr) return;
          const source = tr.dataset.source;
          if (action === 'preview') {
            previewTitle.textContent = source;
            previewBody.textContent = 'Loading…';
            previewPanel.hidden = false;
            const res = await fetch('/admin/knowledge/api/documents/' + encodeURIComponent(source) + '?limit=500');
            const data = await res.json();
            previewBody.textContent = documentTextFromItems(data.items) || '(empty)';
          } else if (action === 'edit') {
            openModal(source);
          } else if (action === 'delete') {
            if (!confirm('Delete document "' + source + '"?')) return;
            const res = await fetch('/admin/knowledge/api/documents/' + encodeURIComponent(source), { method: 'DELETE' });
            if (res.ok) window.location.reload();
            else alert('Delete failed: ' + res.status);
          }
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          submitBtn.disabled = true;
          errorBox.hidden = true;
          try {
            const fd = new FormData(form);
            const fileInput = form.querySelector('input[name="file"]');
            const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
            const text = (textField.value || '').trim();
            if (!hasFile && !text) {
              throw new Error('Upload a PDF, DOCX, or TXT file, or paste text below');
            }
            if (hasFile) {
              assertAllowedUpload(fileInput.files[0]);
            }
            if (!hasFile) {
              fd.delete('file');
            }
            if (hasFile && !text) {
              fd.delete('text');
            }
            let url, method;
            if (editingSource) {
              url = '/admin/knowledge/api/documents/' + encodeURIComponent(editingSource);
              method = 'PUT';
              if (!hasFile) {
                const body = new URLSearchParams();
                body.set('text', text);
                const res = await fetch(url, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
                if (!res.ok) {
                  let msg = 'Request failed (' + res.status + ')';
                  try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
                  throw new Error(msg);
                }
                window.location.reload();
                return;
              }
            } else {
              url = '/admin/knowledge/api/documents';
              method = 'POST';
              if (!fd.get('source')) throw new Error('Source filename is required');
            }
            const res = await fetch(url, { method, body: fd });
            if (!res.ok) {
              let msg = 'Request failed (' + res.status + ')';
              try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
              throw new Error(msg);
            }
            window.location.reload();
          } catch (err) {
            errorBox.textContent = err.message || String(err);
            errorBox.hidden = false;
          } finally {
            submitBtn.disabled = false;
          }
        });
      })();
    </script>
  `

  return renderAppShell('Knowledge base', content, 'knowledge')
}
