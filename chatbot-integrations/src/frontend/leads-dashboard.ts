import type { ConversationRecord, ConversationMessageRecord, LeadRecord } from '../leads/index.js'

interface LeadsSummary {
  leads: { total: number; qualified: number; pendingSync: number }
  conversations: number
  webhookEvents: number
  channels: Record<string, number>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildWhatsappLink(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/[^\d]/g, '')
  return digits ? `https://wa.me/${digits}` : undefined
}

function leadName(lead: LeadRecord): string {
  return lead.leadName ?? lead.senderName ?? 'Unknown'
}

function leadInitials(lead: LeadRecord): string {
  return leadName(lead)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function statusTone(status: string): string {
  if (status === 'qualified' || status === 'synced') return 'success'
  if (status === 'failed' || status === 'unqualified') return 'danger'
  return 'warning'
}

function channelLabel(channel: LeadRecord['channel']): string {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp'
    case 'website':
      return 'Website'
    case 'instagram':
      return 'Instagram'
    case 'messenger':
      return 'Messenger'
    case 'telegram':
      return 'Telegram'
    case 'x':
      return 'X'
    default:
      return channel
  }
}

function iconDot(channel: LeadRecord['channel']): string {
  switch (channel) {
    case 'whatsapp':
      return 'wa'
    case 'website':
      return 'web'
    case 'instagram':
      return 'ig'
    case 'messenger':
      return 'ms'
    case 'telegram':
      return 'tg'
    case 'x':
      return 'x'
    default:
      return 'id'
  }
}

export function renderAppShell(title: string, content: string, activeNav: 'leads' | 'webchat' = 'leads'): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #f7f7f8;
        --panel: #ffffff;
        --panel-alt: #fafafa;
        --text: #111827;
        --muted: #6b7280;
        --line: #e5e7eb;
        --line-strong: #d1d5db;
        --shadow: 0 10px 30px rgba(17, 24, 39, 0.05);
        --blue: #dbeafe;
        --blue-text: #1d4ed8;
        --green: #d1fae5;
        --green-text: #047857;
        --amber: #fef3c7;
        --amber-text: #b45309;
        --danger: #fee2e2;
        --danger-text: #b91c1c;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      a { color: inherit; text-decoration: none; }
      button, input, select { font: inherit; }

      .app-shell {
        min-height: 100vh;
        display: flex;
      }

      .sidebar {
        width: 264px;
        flex-shrink: 0;
        border-right: 1px solid var(--line);
        background: var(--panel);
        display: flex;
        flex-direction: column;
      }

      .brand {
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .brand-main {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .brand-badge {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: #111111;
        color: #ffffff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        font-weight: 800;
      }

      .brand-name {
        font-size: 1.05rem;
        font-weight: 800;
      }

      .sidebar-search {
        padding: 0 16px 16px;
      }

      .search-shell {
        border: 1px solid var(--line);
        background: #f9fafb;
        border-radius: 999px;
        padding: 10px 14px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .nav {
        display: grid;
        gap: 6px;
        padding: 0 12px;
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 999px;
        color: #4b5563;
        font-size: 0.95rem;
        font-weight: 600;
      }

      .nav-item.active {
        background: #111111;
        color: #ffffff;
      }

      .nav-dot {
        width: 18px;
        text-align: center;
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .sidebar-footer {
        margin-top: auto;
        padding: 16px;
        border-top: 1px solid #f0f1f3;
      }

      .sidebar-user {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-top: 8px;
      }

      .user-avatar {
        width: 38px;
        height: 38px;
        border-radius: 999px;
        background: #e0e7ff;
        color: #4338ca;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 0.84rem;
      }

      .user-name {
        font-size: 0.92rem;
        font-weight: 700;
      }

      .user-email {
        color: var(--muted);
        font-size: 0.78rem;
      }

      .page {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .page-header {
        height: 64px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 0 32px;
      }

      .page-title {
        font-size: 1.25rem;
        font-weight: 800;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .btn {
        border-radius: 12px;
        padding: 10px 16px;
        border: 1px solid var(--line-strong);
        background: #ffffff;
        color: #111827;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
      }

      .btn.dark {
        background: #111111;
        color: #ffffff;
        border-color: #111111;
      }

      .btn.link {
        border: 0;
        background: transparent;
        padding: 0;
      }

      .page-body {
        flex: 1;
        overflow: auto;
        padding: 32px;
      }

      .page-inner {
        max-width: 1240px;
        margin: 0 auto;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 20px;
        margin-bottom: 28px;
      }

      .metric-card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 20px;
        box-shadow: var(--shadow);
      }

      .metric-card.blue { background: #eff6ff; border-color: #dbeafe; }
      .metric-card.green { background: #ecfdf5; border-color: #d1fae5; }
      .metric-card.amber { background: #fff7ed; border-color: #ffedd5; }

      .metric-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .metric-label {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .metric-value {
        font-size: 2.1rem;
        line-height: 1;
        font-weight: 800;
      }

      .metric-note {
        margin-top: 10px;
        color: var(--muted);
        font-size: 0.78rem;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      .toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }

      .chip {
        border-radius: 999px;
        padding: 7px 12px;
        background: #f3f4f6;
        color: #4b5563;
        font-size: 0.76rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .chip strong {
        background: #ffffff;
        border-radius: 999px;
        padding: 2px 6px;
        margin-left: 6px;
      }

      .chip.active {
        background: #e5e7eb;
        color: #111827;
      }

      .toolbar select,
      .toolbar input {
        min-height: 40px;
        border: 1px solid var(--line-strong);
        border-radius: 10px;
        padding: 0 12px;
        background: #ffffff;
        color: #111827;
      }

      .lead-list {
        display: grid;
        gap: 14px;
      }

      .lead-card {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 20px;
        box-shadow: var(--shadow);
      }

      .lead-main {
        display: flex;
        gap: 16px;
        min-width: 0;
      }

      .lead-avatar {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        background: #dbeafe;
        color: #2563eb;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        flex-shrink: 0;
      }

      .lead-heading {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }

      .lead-title {
        font-size: 1rem;
        font-weight: 800;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 9px;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .pill.warning { background: var(--amber); color: var(--amber-text); }
      .pill.success { background: var(--green); color: var(--green-text); }
      .pill.danger { background: var(--danger); color: var(--danger-text); }
      .pill.neutral { background: #f3f4f6; color: #4b5563; }

      .lead-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        color: var(--muted);
        font-size: 0.88rem;
      }

      .lead-meta strong {
        color: #374151;
      }

      .channel-meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .channel-icon {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #ecfeff;
        color: #0f766e;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.58rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .lead-side {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
      }

      .lead-side-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .empty {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 32px;
        text-align: center;
        color: var(--muted);
        box-shadow: var(--shadow);
      }

      .detail-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(320px, 1fr);
        gap: 24px;
      }

      .detail-stack {
        display: grid;
        gap: 24px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .panel-head {
        padding: 18px 22px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .panel-title {
        font-size: 1rem;
        font-weight: 800;
      }

      .panel-body {
        padding: 22px;
      }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px 28px;
      }

      .field-label {
        margin-bottom: 6px;
        color: #9ca3af;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .field-value {
        font-size: 0.94rem;
        color: #374151;
        font-weight: 600;
        word-break: break-word;
      }

      .field-value.muted {
        color: #9ca3af;
        font-style: italic;
      }

      .crm-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }

      .transcript {
        min-height: 640px;
        display: flex;
        flex-direction: column;
      }

      .transcript-list {
        flex: 1;
        padding: 22px;
        display: grid;
        gap: 18px;
        background: #fafafa;
      }

      .bubble-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .bubble-wrap.outbound {
        align-items: flex-end;
      }

      .bubble-wrap.inbound {
        align-items: flex-start;
      }

      .bubble {
        max-width: 85%;
        padding: 14px 16px;
        border-radius: 18px;
        font-size: 0.92rem;
        line-height: 1.55;
        box-shadow: 0 6px 16px rgba(17, 24, 39, 0.05);
        white-space: pre-wrap;
      }

      .bubble.inbound {
        background: #e5e7eb;
        color: #111827;
        border-top-left-radius: 6px;
      }

      .bubble.outbound {
        background: #2563eb;
        color: #ffffff;
        border-top-right-radius: 6px;
      }

      .bubble-meta {
        color: #9ca3af;
        font-size: 0.7rem;
        font-weight: 600;
      }

      .transcript-footer {
        padding: 16px;
        border-top: 1px solid var(--line);
        background: #ffffff;
      }

      .note-input {
        width: 100%;
        min-height: 48px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #f3f4f6;
        padding: 0 14px;
      }

      @media (max-width: 1160px) {
        .metric-grid,
        .detail-grid,
        .overview-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 940px) {
        .sidebar {
          display: none;
        }

        .page-header,
        .page-body {
          padding-left: 18px;
          padding-right: 18px;
        }

        .lead-card {
          flex-direction: column;
          align-items: stretch;
        }

        .lead-side {
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-main">
            <span class="brand-badge">C</span>
            <span class="brand-name">Calisto</span>
          </div>
          <span style="color:#9ca3af;font-size:0.82rem;">‹</span>
        </div>
        <div class="sidebar-search">
          <div class="search-shell">Quick Search</div>
        </div>
        <nav class="nav">
          <a class="nav-item" href="#"><span class="nav-dot">D</span>Dashboard</a>
          <a class="nav-item ${activeNav === 'leads' ? 'active' : ''}" href="/reports/leads-dashboard"><span class="nav-dot">L</span>Leads</a>
          <a class="nav-item ${activeNav === 'webchat' ? 'active' : ''}" href="/webchat/test"><span class="nav-dot">W</span>Webchat</a>
        </nav>
        <div class="sidebar-footer">
          <nav class="nav" style="padding:0; margin-bottom: 14px;">
            <a class="nav-item" href="#"><span class="nav-dot">?</span>Support</a>
            <a class="nav-item" href="#"><span class="nav-dot">S</span>Settings</a>
          </nav>
          <div class="sidebar-user">
            <div class="user-avatar">JS</div>
            <div>
              <div class="user-name">John Smith</div>
              <div class="user-email">john@filtocrm.com</div>
            </div>
          </div>
        </div>
      </aside>
      ${content}
    </div>
  </body>
</html>`
}

function renderLeadCard(lead: LeadRecord): string {
  const whatsappLink = buildWhatsappLink(lead.phone)
  const contact = lead.phone ?? lead.email ?? `ID: ${lead.sourceId}`
  const service = lead.preferredService ?? 'No interest captured yet'

  return `
    <article
      class="lead-card"
      data-lead-id="${escapeHtml(lead.id)}"
      data-channel="${escapeHtml(lead.channel)}"
      data-status="${escapeHtml(lead.qualificationStatus)}"
      data-crm="${escapeHtml(lead.crmStatus)}"
      data-search="${escapeHtml([
        leadName(lead),
        lead.phone ?? '',
        lead.email ?? '',
        lead.preferredService ?? '',
        lead.location ?? '',
        lead.sourceId,
      ].join(' ').toLowerCase())}"
    >
      <div class="lead-main">
        <div class="lead-avatar">${escapeHtml(leadInitials(lead))}</div>
        <div>
          <div class="lead-heading">
            <div class="lead-title">${escapeHtml(leadName(lead))}</div>
            <span class="pill ${statusTone(lead.qualificationStatus)}">${escapeHtml(lead.qualificationStatus)}</span>
          </div>
          <div class="lead-meta">
            <span class="channel-meta">
              <span class="channel-icon">${escapeHtml(iconDot(lead.channel))}</span>
              ${escapeHtml(channelLabel(lead.channel))}
            </span>
            <span>${escapeHtml(contact)}</span>
            <strong>${escapeHtml(service)}</strong>
          </div>
        </div>
      </div>
      <div class="lead-side">
        <span class="pill ${statusTone(lead.crmStatus)}">${escapeHtml(lead.crmStatus)}</span>
        <div class="lead-side-actions">
          ${whatsappLink ? `<a class="btn" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
          ${lead.email ? `<a class="btn" href="mailto:${escapeHtml(lead.email)}">Email</a>` : ''}
          <a class="btn dark" href="/reports/leads-dashboard/${escapeHtml(lead.id)}">Review Lead</a>
        </div>
      </div>
    </article>
  `
}

function renderTranscriptItem(message: ConversationMessageRecord): string {
  const direction = message.direction === 'outbound' ? 'outbound' : 'inbound'
  const label = direction === 'outbound' ? 'Outbound (AI Assistant)' : 'Inbound'
  return `
    <div class="bubble-wrap ${direction}">
      <div class="bubble ${direction}">${escapeHtml(message.text ?? `[${message.messageType}]`)}</div>
      <span class="bubble-meta">${escapeHtml(label)} • ${escapeHtml(formatDate(message.timestamp))}</span>
    </div>
  `
}

export function renderLeadsDashboardHtml({
  leads,
  conversations,
  summary,
}: {
  leads: LeadRecord[]
  conversations: ConversationRecord[]
  summary: LeadsSummary
}): string {
  const channelChips = Object.entries(summary.channels)
    .map(([channel, count], index) => `<button type="button" class="chip ${index === 0 ? 'active' : ''}" data-channel-chip="${escapeHtml(channel)}">${escapeHtml(channelLabel(channel as LeadRecord['channel']))}<strong>${count}</strong></button>`)
    .join('')

  const content = `
    <main class="page">
      <header class="page-header">
        <div class="page-title">Lead Operations Dashboard</div>
        <div class="header-actions">
          <button class="btn">Sync CRM</button>
          <button class="btn dark">Live View</button>
        </div>
      </header>
      <div class="page-body">
        <div class="page-inner">
          <section class="metric-grid">
            <article class="metric-card blue">
              <div class="metric-head">
                <span class="metric-label">Total Leads</span>
                <span>◌</span>
              </div>
              <div class="metric-value">${summary.leads.total}</div>
              <div class="metric-note">Webhook Events: <strong>${summary.webhookEvents}</strong></div>
            </article>
            <article class="metric-card green">
              <div class="metric-head">
                <span class="metric-label">Qualified</span>
                <span>◌</span>
              </div>
              <div class="metric-value">${summary.leads.qualified}</div>
              <div class="metric-note">Conversations tracked: <strong>${summary.conversations}</strong></div>
            </article>
            <article class="metric-card amber">
              <div class="metric-head">
                <span class="metric-label">Pending CRM Sync</span>
                <span>◌</span>
              </div>
              <div class="metric-value">${summary.leads.pendingSync}</div>
              <div class="metric-note">Leads awaiting sync or review</div>
            </article>
          </section>

          <section class="toolbar">
            <div class="toolbar-group">
              ${channelChips || ''}
              <select id="channelFilter">
                <option value="">All Channels</option>
                ${Object.keys(summary.channels).map((channel) => `<option value="${escapeHtml(channel)}">${escapeHtml(channelLabel(channel as LeadRecord['channel']))}</option>`).join('')}
              </select>
              <select id="statusFilter">
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="needs_review">Needs Review</option>
                <option value="qualified">Qualified</option>
                <option value="unqualified">Unqualified</option>
              </select>
              <select id="crmFilter">
                <option value="">CRM State</option>
                <option value="pending">Pending</option>
                <option value="synced">Synced</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div class="toolbar-group">
              <input id="search" type="search" placeholder="Search leads" />
              <span id="resultCount" style="color:#6b7280;font-size:0.9rem;font-weight:600;">Showing ${leads.length} leads</span>
              <button id="clearFilters" class="btn link" type="button" style="color:#4f46e5;font-weight:700;">Clear filters</button>
            </div>
          </section>

          <section id="leadList" class="lead-list">
            ${leads.length ? leads
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((lead) => renderLeadCard(lead))
              .join('') : '<div class="empty">No leads captured yet.</div>'}
          </section>
        </div>
      </div>
    </main>
    <script>
      const cards = Array.from(document.querySelectorAll('.lead-card'));
      const search = document.getElementById('search');
      const channelFilter = document.getElementById('channelFilter');
      const statusFilter = document.getElementById('statusFilter');
      const crmFilter = document.getElementById('crmFilter');
      const resultCount = document.getElementById('resultCount');
      const clearFilters = document.getElementById('clearFilters');
      const channelChips = Array.from(document.querySelectorAll('[data-channel-chip]'));

      function applyFilters() {
        const query = (search.value || '').trim().toLowerCase();
        const channel = channelFilter.value;
        const status = statusFilter.value;
        const crm = crmFilter.value;
        let visibleCount = 0;

        cards.forEach((card) => {
          const matchesQuery = !query || (card.dataset.search || '').includes(query);
          const matchesChannel = !channel || card.dataset.channel === channel;
          const matchesStatus = !status || card.dataset.status === status;
          const matchesCrm = !crm || card.dataset.crm === crm;
          const visible = matchesQuery && matchesChannel && matchesStatus && matchesCrm;
          card.style.display = visible ? '' : 'none';
          if (visible) visibleCount += 1;
        });

        resultCount.textContent = 'Showing ' + visibleCount + ' lead' + (visibleCount === 1 ? '' : 's');
      }

      search.addEventListener('input', applyFilters);
      channelFilter.addEventListener('change', applyFilters);
      statusFilter.addEventListener('change', applyFilters);
      crmFilter.addEventListener('change', applyFilters);

      clearFilters.addEventListener('click', () => {
        search.value = '';
        channelFilter.value = '';
        statusFilter.value = '';
        crmFilter.value = '';
        channelChips.forEach((chip) => chip.classList.remove('active'));
        applyFilters();
      });

      channelChips.forEach((chip) => {
        chip.addEventListener('click', () => {
          const nextValue = chip.dataset.channelChip || '';
          const currentlyActive = chip.classList.contains('active') && channelFilter.value === nextValue;
          channelChips.forEach((entry) => entry.classList.remove('active'));
          if (currentlyActive) {
            channelFilter.value = '';
          } else {
            chip.classList.add('active');
            channelFilter.value = nextValue;
          }
          applyFilters();
        });
      });
    </script>
  `

  return renderAppShell('Lead Operations Dashboard', content, 'leads')
}

export function renderLeadDetailHtml({
  lead,
  conversation,
}: {
  lead: LeadRecord
  conversation?: ConversationRecord
}): string {
  const whatsappLink = buildWhatsappLink(lead.phone)
  const transcript = (conversation?.messages ?? []).slice(-20)
  const content = `
    <main class="page">
      <header class="page-header">
        <div class="header-actions" style="gap:16px;">
          <a class="btn link" href="/reports/leads-dashboard" style="color:#6b7280;font-weight:700;">← Back to Leads</a>
        </div>
        <div class="header-actions">
          <button class="btn">Share</button>
          <button class="btn">Notify</button>
        </div>
      </header>
      <div class="page-body">
        <div class="page-inner">
          <section style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
              <h1 style="margin:0;font-size:2rem;line-height:1;font-weight:800;">${escapeHtml(leadName(lead))}</h1>
              <span class="pill ${statusTone(lead.qualificationStatus)}">${escapeHtml(lead.qualificationStatus)}</span>
            </div>
            <div class="header-actions">
              <button class="btn dark">Push to CRM</button>
              <button class="btn">Actions</button>
            </div>
          </section>

          <section class="detail-grid">
            <div class="detail-stack">
              <article class="panel">
                <div class="panel-head">
                  <div class="panel-title">Lead Overview</div>
                  <a href="#" style="color:#4f46e5;font-size:0.82rem;font-weight:700;">Edit Info</a>
                </div>
                <div class="panel-body">
                  <div class="overview-grid">
                    <div>
                      <div class="field-label">Source ID</div>
                      <div class="field-value">${escapeHtml(lead.sourceId)}</div>
                    </div>
                    <div>
                      <div class="field-label">Channel</div>
                      <div class="field-value">${escapeHtml(channelLabel(lead.channel))} Widget</div>
                    </div>
                    <div>
                      <div class="field-label">Interest</div>
                      <div class="field-value">${escapeHtml(lead.preferredService ?? 'Not captured')}</div>
                    </div>
                    <div>
                      <div class="field-label">First Seen</div>
                      <div class="field-value">${escapeHtml(formatDate(lead.createdAt))}</div>
                    </div>
                    <div>
                      <div class="field-label">Location</div>
                      <div class="field-value ${lead.location ? '' : 'muted'}">${escapeHtml(lead.location ?? 'Not provided')}</div>
                    </div>
                    <div>
                      <div class="field-label">Email</div>
                      <div class="field-value ${lead.email ? '' : 'muted'}">${escapeHtml(lead.email ?? 'Not provided')}</div>
                    </div>
                    <div style="grid-column:1 / -1;">
                      <div class="field-label">Phone</div>
                      <div class="field-value ${lead.phone ? '' : 'muted'}">${escapeHtml(lead.phone ?? 'Not provided')}</div>
                    </div>
                  </div>
                </div>
              </article>

              <article class="panel">
                <div class="panel-head">
                  <div class="panel-title">CRM Integration</div>
                </div>
                <div class="panel-body">
                  <div class="overview-grid">
                    <div>
                      <div class="field-label">CRM Status</div>
                      <div class="field-value"><span class="pill ${statusTone(lead.crmStatus)}">${escapeHtml(lead.crmStatus)}</span></div>
                    </div>
                    <div>
                      <div class="field-label">CRM Record</div>
                      <div class="field-value ${lead.crmRecordId ? '' : 'muted'}">${escapeHtml(lead.crmRecordId ?? 'No match found')}</div>
                    </div>
                    <div>
                      <div class="field-label">Conversation ID</div>
                      <div class="field-value">${escapeHtml(lead.conversationId)}</div>
                    </div>
                    <div>
                      <div class="field-label">Last Intent</div>
                      <div class="field-value ${lead.lastIntent ? '' : 'muted'}">${escapeHtml(lead.lastIntent ?? 'Not captured')}</div>
                    </div>
                  </div>
                  <div class="crm-actions">
                    <button class="btn dark">Push to CRM</button>
                    <button class="btn">Mark Invalid</button>
                    <button class="btn">Merge Lead</button>
                    ${whatsappLink ? `<a class="btn" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noreferrer">Open WhatsApp</a>` : ''}
                    ${lead.email ? `<a class="btn" href="mailto:${escapeHtml(lead.email)}">Send Email</a>` : ''}
                  </div>
                </div>
              </article>
            </div>

            <article class="panel transcript">
              <div class="panel-head">
                <div class="panel-title">Recent Transcript</div>
                <span style="color:#9ca3af;font-size:0.72rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">${transcript.length} Messages</span>
              </div>
              <div class="transcript-list">
                ${transcript.length ? transcript.map((message) => renderTranscriptItem(message)).join('') : '<div class="field-value muted">No transcript available yet.</div>'}
              </div>
              <div class="transcript-footer">
                <input class="note-input" type="text" placeholder="Internal note or reply..." />
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  `

  return renderAppShell(`${leadName(lead)} - Lead Detail`, content, 'leads')
}

export function findLeadById(leads: LeadRecord[], leadId: string): LeadRecord | undefined {
  return leads.find((lead) => lead.id === leadId)
}

export function findConversationByLeadId(conversations: ConversationRecord[], leadId: string): ConversationRecord | undefined {
  const leadConversation = conversations.find((entry) => entry.leadId === leadId)
  if (leadConversation) {
    return leadConversation
  }
  return conversations.find((entry) => entry.id === leadId)
}
