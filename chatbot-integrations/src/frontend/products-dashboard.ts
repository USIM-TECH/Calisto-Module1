import type { ProductRecord } from '../products/types.js'
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

function formatPrice(value: number): string {
  return `RM${value.toFixed(2)}`
}

function stockTone(status: string): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'in_stock') return 'success'
  if (s === 'low_stock') return 'warning'
  if (s === 'out_of_stock') return 'danger'
  return 'neutral'
}

function thumbnailHtml(product: ProductRecord): string {
  if (product.imageUrl) {
    return `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.productName)}" />`
  }
  const initials = (product.brand?.[0] ?? '?').toUpperCase()
  return `<span>${escapeHtml(initials)}</span>`
}

function rowSearchBlob(product: ProductRecord): string {
  return [
    product.productId,
    product.productName,
    product.brand,
    product.productType,
    product.category,
    product.description ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function renderRow(product: ProductRecord): string {
  return `
    <tr data-product-id="${escapeHtml(product.productId)}" data-search="${escapeHtml(rowSearchBlob(product))}" data-product-type="${escapeHtml(product.productType)}" data-product-brand="${escapeHtml(product.brand)}">
      <td><div class="thumb">${thumbnailHtml(product)}</div></td>
      <td class="mono">${escapeHtml(product.productId)}</td>
      <td>
        <div class="cell-strong">${escapeHtml(product.productName)}</div>
        <div class="cell-muted">${escapeHtml(product.brand)}</div>
      </td>
      <td>${escapeHtml(product.productType)}</td>
      <td>${escapeHtml(product.category)}</td>
      <td class="mono">${formatPrice(product.priceMyr)}</td>
      <td><span class="pill ${stockTone(product.stockStatus)}">${escapeHtml(product.stockStatus.replace(/_/g, ' '))}</span></td>
      <td>${product.rating !== null && product.rating !== undefined ? product.rating.toFixed(1) : '-'}</td>
      <td class="actions-col">
        <button class="btn link" type="button" data-action="edit">Edit</button>
        <button class="btn link danger" type="button" data-action="delete">Delete</button>
      </td>
    </tr>`
}

export function renderProductsAdminHtml({
  items,
  productTypes,
  brands,
}: {
  items: ProductRecord[]
  productTypes: string[]
  brands: string[]
}): string {
  const rows = items.map(renderRow).join('')
  const productTypeOptions = productTypes.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')
  const brandOptions = brands.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')

  const content = `
    <main class="page">
      <header class="page-header">
        <div class="page-title">Product Catalogue</div>
        <div class="header-actions">
          <button id="importBtn" class="btn" type="button">Import CSV</button>
          <button id="addBtn" class="btn dark" type="button">+ Add Product</button>
        </div>
      </header>
      <div class="page-body">
        <div class="page-inner">
          <section class="toolbar">
            <div class="toolbar-group">
              <input id="searchInput" type="search" placeholder="Search id, name, brand..." />
              <select id="typeFilter">
                <option value="">All product types</option>
                ${productTypeOptions}
              </select>
              <select id="brandFilter">
                <option value="">All brands</option>
                ${brandOptions}
              </select>
            </div>
            <div class="toolbar-group">
              <span id="resultCount" style="color:#6b7280;font-size:0.9rem;font-weight:600;">${items.length} products</span>
              <button id="clearFilters" class="btn link" type="button" style="color:#4f46e5;font-weight:700;">Clear</button>
            </div>
          </section>

          <section class="table-card">
            <table class="data-table">
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
                ${rows || '<tr><td colspan="9" class="empty-cell">No products yet. Click "Add Product".</td></tr>'}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>

    <div id="modalBackdrop" class="modal-backdrop" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onclick="event.stopPropagation()">
        <header class="modal-head">
          <h2 id="modalTitle">Add Product</h2>
          <button type="button" id="closeModal" class="btn link" aria-label="Close">x</button>
        </header>
        <form id="productForm" class="modal-form" enctype="multipart/form-data">
          <input type="hidden" name="productId" id="field-productId" />

          <fieldset>
            <legend>Identity</legend>
            <div class="field-grid">
              <label>Product ID <span class="hint">(blank = auto)</span><input name="productId" id="field-productIdEditable" placeholder="P0501" /></label>
              <label>Product Name *<input name="productName" required /></label>
              <label>Brand *<input name="brand" required /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Catalogue</legend>
            <div class="field-grid">
              <label>Category *<input name="category" required placeholder="Frames" /></label>
              <label>Product Type *<input name="productType" required placeholder="Designer Frames" /></label>
              <label>Gender<select name="gender"><option value="">-</option><option value="men">men</option><option value="women">women</option><option value="unisex">unisex</option></select></label>
            </div>
            <label class="full">Description<textarea name="description" rows="2"></textarea></label>
          </fieldset>

          <fieldset>
            <legend>Pricing &amp; Stock</legend>
            <div class="field-grid">
              <label>Price (MYR) *<input name="priceMyr" type="number" min="0" step="0.01" required /></label>
              <label>Stock Status<select name="stockStatus"><option value="in_stock">in_stock</option><option value="low_stock">low_stock</option><option value="out_of_stock">out_of_stock</option></select></label>
              <label>Rating<input name="rating" type="number" min="0" max="5" step="0.1" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Frame</legend>
            <div class="field-grid">
              <label>Material<input name="frameMaterial" /></label>
              <label>Shape<input name="frameShape" /></label>
              <label>Color<input name="frameColor" /></label>
              <label>Style<input name="frameStyle" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Lens &amp; Optics</legend>
            <div class="field-grid">
              <label>Lens Type<input name="lensType" /></label>
              <label>Lens Color<input name="lensColor" /></label>
              <label>Lens Feature<input name="lensFeature" /></label>
              <label>Lens Duration<input name="lensDuration" /></label>
              <label>UV Protection<select name="uvProtection"><option value="">-</option><option value="yes">yes</option><option value="no">no</option></select></label>
              <label>Polarized<select name="polarized"><option value="">-</option><option value="yes">yes</option><option value="no">no</option></select></label>
              <label>Multifocal<select name="multifocal"><option value="">-</option><option value="yes">yes</option><option value="no">no</option></select></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Location</legend>
            <div class="field-grid">
              <label>Store Location<input name="storeLocation" /></label>
              <label>City<input name="city" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Flags</legend>
            <div class="field-grid">
              <label class="checkbox"><input type="checkbox" name="bestseller" value="true" /> Bestseller</label>
              <label class="checkbox"><input type="checkbox" name="newArrival" value="true" /> New Arrival</label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Image</legend>
            <div class="field-grid">
              <label class="full">Upload (JPEG/PNG/WEBP, max 2 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
              <label class="full">Or paste URL<input name="imageUrl" placeholder="https://... or /static/products/abc.jpg" /></label>
              <div id="imagePreviewWrap" hidden><img id="imagePreview" alt="current image" /></div>
            </div>
          </fieldset>

          <div id="formError" class="form-error" hidden></div>
          <div class="modal-actions">
            <button type="button" id="cancelBtn" class="btn">Cancel</button>
            <button type="submit" id="submitBtn" class="btn dark">Save</button>
          </div>
        </form>
      </div>
    </div>

    <div id="importBackdrop" class="modal-backdrop" aria-hidden="true">
      <div class="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="importTitle" onclick="event.stopPropagation()">
        <header class="modal-head">
          <h2 id="importTitle">Import products from CSV</h2>
          <button type="button" id="closeImport" class="btn link" aria-label="Close">x</button>
        </header>
        <form id="importForm" class="modal-form">
          <p style="margin:0;color:#4b5563;line-height:1.55;font-size:0.88rem;">
            Upload a CSV with the same columns as the catalogue export.
            Required: <code>product_id</code>, <code>product_name</code>, <code>category</code>,
            <code>product_type</code>, <code>brand</code>, <code>price_myr</code>.
          </p>
          <p style="margin:0;">
            <a href="/admin/products/api/import/template.csv" class="btn link" style="padding:0;font-weight:700;">Download template CSV</a>
          </p>
          <label>CSV file *
            <input name="file" type="file" accept=".csv,text/csv" required />
          </label>
          <fieldset class="import-mode">
            <legend>If product ID already exists</legend>
            <label class="radio"><input type="radio" name="mode" value="skip" checked /> Skip row</label>
            <label class="radio"><input type="radio" name="mode" value="update" /> Update existing product</label>
          </fieldset>
          <div id="importResult" class="import-result" hidden></div>
          <div id="importRowErrors" class="import-row-errors" hidden></div>
          <div id="importError" class="form-error" hidden></div>
          <div class="modal-actions">
            <button type="button" id="cancelImport" class="btn">Cancel</button>
            <button type="submit" id="importSubmit" class="btn dark">Import</button>
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
      .cell-strong { font-weight: 700; }
      .cell-muted { color: var(--muted); font-size: 0.82rem; margin-top: 2px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86rem; }
      .actions-col { text-align: right; white-space: nowrap; }
      .actions-col .btn.link { color: #2563eb; font-weight: 700; padding: 4px 8px; }
      .actions-col .btn.link.danger { color: var(--danger-text); margin-left: 6px; }
      .empty-cell { padding: 32px; text-align: center; color: var(--muted); }
      .thumb { width: 44px; height: 44px; border-radius: 10px; background: #f3f4f6; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; color: #6b7280; font-weight: 800; }
      .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

      /* display:flex would override the [hidden] attribute in some browsers — use .is-open only */
      .modal-backdrop { position: fixed; inset: 0; background: rgba(17, 24, 39, 0.45); display: none; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 50; }
      .modal-backdrop.is-open { display: flex; }
      .modal { background: var(--panel); width: 100%; max-width: 720px; border-radius: 16px; box-shadow: 0 20px 60px rgba(17, 24, 39, 0.2); overflow: hidden; }
      .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line); }
      .modal-head h2 { margin: 0; font-size: 1.1rem; font-weight: 800; }
      .modal-form { padding: 18px 22px 22px; display: grid; gap: 18px; }
      .modal-form fieldset { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
      .modal-form legend { padding: 0 8px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
      .field-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .modal-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; color: #374151; font-weight: 600; }
      .modal-form label.full { grid-column: 1 / -1; }
      .modal-form label.checkbox { flex-direction: row; align-items: center; gap: 8px; font-weight: 600; }
      .modal-form input[type="text"], .modal-form input[type="number"], .modal-form input:not([type]), .modal-form select, .modal-form textarea { font: inherit; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: #ffffff; color: #111827; }
      .modal-form input[type="file"] { font-size: 0.82rem; }
      .hint { color: #9ca3af; font-weight: 500; margin-left: 6px; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
      .form-error { color: var(--danger-text); background: var(--danger); border-radius: 10px; padding: 10px 12px; font-size: 0.85rem; font-weight: 600; }
      #imagePreviewWrap img { max-width: 120px; max-height: 120px; border-radius: 10px; border: 1px solid var(--line); }
      .import-modal { max-width: 560px; }
      .import-mode { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
      .import-mode legend { padding: 0 8px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
      .import-mode .radio { flex-direction: row; align-items: center; gap: 8px; margin-top: 8px; }
      .import-result { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 10px; padding: 12px 14px; font-size: 0.88rem; line-height: 1.5; }
      .import-result.has-errors { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
      .import-row-errors { margin-top: 10px; max-height: 220px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: #fafafa; padding: 10px 12px; font-size: 0.82rem; }
      .import-row-errors h4 { margin: 0 0 8px; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
      .import-row-errors ul { margin: 0; padding-left: 18px; }
      .import-row-errors li { margin-bottom: 6px; line-height: 1.45; color: #374151; }
      .import-error-details { margin: 8px 0 0; padding-left: 18px; font-size: 0.85rem; line-height: 1.5; }
      .import-error-details li { margin-bottom: 4px; }
      @media (max-width: 760px) { .field-grid { grid-template-columns: 1fr; } }
    </style>

    <script>
      (function() {
        const rowsEl = document.getElementById('rows');
        const searchInput = document.getElementById('searchInput');
        const typeFilter = document.getElementById('typeFilter');
        const brandFilter = document.getElementById('brandFilter');
        const resultCount = document.getElementById('resultCount');
        const clearBtn = document.getElementById('clearFilters');

        const addBtn = document.getElementById('addBtn');
        const backdrop = document.getElementById('modalBackdrop');
        const closeModal = document.getElementById('closeModal');
        const cancelBtn = document.getElementById('cancelBtn');
        const form = document.getElementById('productForm');
        const submitBtn = document.getElementById('submitBtn');
        const errorBox = document.getElementById('formError');
        const modalTitle = document.getElementById('modalTitle');
        const idField = document.getElementById('field-productIdEditable');
        const previewWrap = document.getElementById('imagePreviewWrap');
        const previewImg = document.getElementById('imagePreview');

        const importBtn = document.getElementById('importBtn');
        const importBackdrop = document.getElementById('importBackdrop');
        const closeImport = document.getElementById('closeImport');
        const cancelImport = document.getElementById('cancelImport');
        const importForm = document.getElementById('importForm');
        const importSubmit = document.getElementById('importSubmit');
        const importError = document.getElementById('importError');
        const importResult = document.getElementById('importResult');
        const importRowErrors = document.getElementById('importRowErrors');

        function clearImportFeedback() {
          importError.hidden = true;
          importError.innerHTML = '';
          importResult.hidden = true;
          importResult.textContent = '';
          importResult.classList.remove('has-errors');
          importRowErrors.hidden = true;
          importRowErrors.innerHTML = '';
        }

        function showImportFileError(body) {
          let html = '<div>' + (body.error || 'Import failed') + '</div>';
          if (body.code === 'MISSING_COLUMNS' && Array.isArray(body.missingColumns)) {
            html += '<ul class="import-error-details"><li><strong>Missing:</strong> ' + body.missingColumns.join(', ') + '</li>';
            if (Array.isArray(body.foundColumns) && body.foundColumns.length) {
              html += '<li><strong>Found in file:</strong> ' + body.foundColumns.join(', ') + '</li>';
            }
            if (Array.isArray(body.requiredColumns)) {
              html += '<li><strong>Required:</strong> ' + body.requiredColumns.join(', ') + '</li>';
            }
            html += '</ul>';
          } else if (body.code === 'NO_DATA_ROWS') {
            html += '<ul class="import-error-details"><li>Add at least one product row below the header.</li></ul>';
          }
          importError.innerHTML = html;
          importError.hidden = false;
        }

        function showImportRowErrors(rows) {
          if (!rows || !rows.length) return;
          const max = 20;
          const slice = rows.slice(0, max);
          const items = slice.map((row) => {
            const id = row.productId ? ' (' + row.productId + ')' : '';
            return '<li><strong>Line ' + row.line + '</strong>' + id + ': ' + row.reason + '</li>';
          }).join('');
          const more = rows.length > max ? '<li>…and ' + (rows.length - max) + ' more</li>' : '';
          importRowErrors.innerHTML = '<h4>Row errors</h4><ul>' + items + more + '</ul>';
          importRowErrors.hidden = false;
        }

        let editingId = null;

        function applyFilters() {
          const q = (searchInput.value || '').trim().toLowerCase();
          const type = typeFilter.value;
          const brand = brandFilter.value;
          const rows = Array.from(rowsEl.querySelectorAll('tr[data-product-id]'));
          let visible = 0;
          rows.forEach((row) => {
            const matchesQ = !q || (row.dataset.search || '').includes(q);
            const matchesType = !type || (row.dataset.productType || '') === type;
            const matchesBrand = !brand || (row.dataset.productBrand || '') === brand;
            const ok = matchesQ && matchesType && matchesBrand;
            row.style.display = ok ? '' : 'none';
            if (ok) visible += 1;
          });
          resultCount.textContent = visible + ' product' + (visible === 1 ? '' : 's');
        }

        searchInput.addEventListener('input', applyFilters);
        typeFilter.addEventListener('change', applyFilters);
        brandFilter.addEventListener('change', applyFilters);
        clearBtn.addEventListener('click', () => { searchInput.value=''; typeFilter.value=''; brandFilter.value=''; applyFilters(); });

        function openModal(record) {
          form.reset();
          errorBox.hidden = true;
          previewWrap.hidden = true;
          previewImg.src = '';
          if (record) {
            editingId = record.productId;
            modalTitle.textContent = 'Edit Product (' + record.productId + ')';
            idField.value = record.productId;
            idField.readOnly = true;
            for (const [key, value] of Object.entries(record)) {
              const el = form.elements.namedItem(key);
              if (!el) continue;
              if (el.type === 'checkbox') {
                el.checked = Boolean(value);
              } else if (el.tagName === 'SELECT' || el.type === 'text' || el.type === 'number' || el.type === 'textarea' || el.tagName === 'TEXTAREA' || !el.type) {
                el.value = value === null || value === undefined ? '' : value;
              }
            }
            if (record.imageUrl) {
              previewImg.src = record.imageUrl;
              previewWrap.hidden = false;
            }
          } else {
            editingId = null;
            modalTitle.textContent = 'Add Product';
            idField.value = '';
            idField.readOnly = false;
          }
          backdrop.classList.add('is-open');
          backdrop.setAttribute('aria-hidden', 'false');
        }

        function closeModalNow() {
          backdrop.classList.remove('is-open');
          backdrop.setAttribute('aria-hidden', 'true');
        }

        addBtn.addEventListener('click', () => openModal(null));
        closeModal.addEventListener('click', closeModalNow);
        cancelBtn.addEventListener('click', closeModalNow);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalNow(); });

        function openImportModal() {
          importForm.reset();
          clearImportFeedback();
          importBackdrop.classList.add('is-open');
          importBackdrop.setAttribute('aria-hidden', 'false');
        }

        function closeImportModal() {
          importBackdrop.classList.remove('is-open');
          importBackdrop.setAttribute('aria-hidden', 'true');
        }

        importBtn.addEventListener('click', openImportModal);
        closeImport.addEventListener('click', closeImportModal);
        cancelImport.addEventListener('click', closeImportModal);
        importBackdrop.addEventListener('click', (e) => { if (e.target === importBackdrop) closeImportModal(); });

        importForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          importSubmit.disabled = true;
          clearImportFeedback();
          try {
            const fd = new FormData(importForm);
            const res = await fetch('/admin/products/api/import', { method: 'POST', body: fd });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              showImportFileError(body);
              return;
            }
            const parts = [
              body.inserted + ' added',
              body.updated ? body.updated + ' updated' : null,
              body.skipped ? body.skipped + ' skipped' : null,
              body.invalid ? body.invalid + ' invalid' : null,
            ].filter(Boolean);
            importResult.textContent = 'Import finished: ' + parts.join(', ') + ' (' + body.total + ' rows in file).';
            if (body.invalid > 0) {
              importResult.classList.add('has-errors');
              showImportRowErrors(body.invalidRows || []);
            }
            importResult.hidden = false;
            if (body.inserted > 0 || body.updated > 0) {
              setTimeout(() => window.location.reload(), body.invalid > 0 ? 2500 : 1200);
            }
          } catch (err) {
            importError.textContent = err.message || String(err);
            importError.hidden = false;
          } finally {
            importSubmit.disabled = false;
          }
        });

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeModalNow();
          if (e.key === 'Escape' && importBackdrop.classList.contains('is-open')) closeImportModal();
        });

        rowsEl.addEventListener('click', async (e) => {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          const action = target.dataset.action;
          if (!action) return;
          const tr = target.closest('tr[data-product-id]');
          if (!tr) return;
          const pid = tr.dataset.productId;
          if (action === 'edit') {
            const res = await fetch('/admin/products/api/' + encodeURIComponent(pid));
            if (!res.ok) { alert('Failed to load product'); return; }
            const data = await res.json();
            openModal(data);
          } else if (action === 'delete') {
            const label = tr.querySelector('.cell-strong');
            const name = label ? label.textContent : pid;
            if (!confirm('Delete ' + pid + ' (' + name + ')?')) return;
            const res = await fetch('/admin/products/api/' + encodeURIComponent(pid), { method: 'DELETE' });
            if (res.ok) {
              window.location.reload();
            } else {
              alert('Delete failed: ' + res.status);
            }
          }
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          submitBtn.disabled = true;
          errorBox.hidden = true;
          try {
            const fd = new FormData(form);
            const fileInput = form.querySelector('input[name="image"]');
            if (fileInput && (!fileInput.files || fileInput.files.length === 0)) {
              fd.delete('image');
            }
            ['bestseller', 'newArrival'].forEach((name) => {
              const cb = form.querySelector('input[name="' + name + '"]');
              fd.set(name, cb && cb.checked ? 'true' : 'false');
            });
            const url = editingId ? '/admin/products/api/' + encodeURIComponent(editingId) : '/admin/products/api';
            const method = editingId ? 'PUT' : 'POST';
            const res = await fetch(url, { method, body: fd });
            if (!res.ok) {
              let msg = 'Request failed (' + res.status + ')';
              try { const body = await res.json(); if (body && body.error) msg = body.error; } catch {}
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

  return renderAppShell('Product Catalogue', content, 'products')
}
