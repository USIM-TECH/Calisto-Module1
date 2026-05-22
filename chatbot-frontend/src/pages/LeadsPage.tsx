import { useEffect, useMemo, useState } from 'react'
import { getLeads } from '../api/client'
import type { ChannelIdentityRecord, CustomerRecord, LeadsResponse } from '../types'

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type ChannelName = 'whatsapp' | 'website' | 'instagram' | 'messenger' | 'telegram' | 'x'

function statusTone(status: string) {
  if (status === 'qualified' || status === 'synced') return 'success'
  if (status === 'failed' || status === 'unqualified') return 'danger'
  return 'warning'
}

function channelLabel(channel: ChannelName) {
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

function iconDot(channel: ChannelName) {
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

function buildWhatsappLink(phone?: string) {
  if (!phone) return undefined
  const digits = phone.replace(/[^\d]/g, '')
  return digits ? `https://wa.me/${digits}` : undefined
}

function customerName(customer: CustomerRecord) {
  return customer.leadName ?? customer.email ?? customer.phone ?? 'Unknown'
}

function customerInitials(customer: CustomerRecord) {
  return customerName(customer)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function buildIdentitiesByCustomer(identities: ChannelIdentityRecord[]) {
  const map = new Map<string, ChannelIdentityRecord[]>()
  identities.forEach((identity) => {
    const list = map.get(identity.customerId) ?? []
    list.push(identity)
    map.set(identity.customerId, list)
  })
  return map
}

export default function LeadsPage() {
  const [data, setData] = useState<LeadsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [crmFilter, setCrmFilter] = useState('')
  const [activeChip, setActiveChip] = useState('')

  useEffect(() => {
    getLeads()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  const identitiesByCustomer = useMemo(() => {
    if (!data) return new Map<string, ChannelIdentityRecord[]>()
    return buildIdentitiesByCustomer(data.identities)
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.customers
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter((customer) => {
        const matchesQuery = !term || [
          customerName(customer),
          customer.phone,
          customer.email,
          customer.preferredService,
          customer.location,
          customer.lastIntent,
          ...(identitiesByCustomer.get(customer.id) ?? []).map((i) => i.sourceId),
          ...(identitiesByCustomer.get(customer.id) ?? []).map((i) => i.username ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)

        const matchesStatus = !statusFilter || customer.qualificationStatus === statusFilter
        const matchesCrm = !crmFilter || customer.crmStatus === crmFilter
        const channels = new Set((identitiesByCustomer.get(customer.id) ?? []).map((i) => i.channel))
        const matchesChannel = !channelFilter || channels.has(channelFilter as ChannelName)

        return matchesQuery && matchesStatus && matchesCrm && matchesChannel
      })
  }, [data, identitiesByCustomer, search, statusFilter, crmFilter, channelFilter])

  const channelChips = useMemo(() => {
    if (!data) return []
    return Object.entries(data.summary.channels)
  }, [data])

  function clearFilters() {
    setSearch('')
    setChannelFilter('')
    setStatusFilter('')
    setCrmFilter('')
    setActiveChip('')
  }

  return (
    <>
      <header className="page-header">
        <div className="page-title">Lead Operations Dashboard</div>
        <div className="header-actions">
          <button className="btn">Sync CRM</button>
          <button className="btn dark">Live View</button>
        </div>
      </header>
      <div className="page-body">
        <div className="page-inner">
          {error && <div className="card">{error}</div>}
          {!data && !error && <div className="card">Loading...</div>}
          {data && (
            <>
              <section className="metric-grid">
                <article className="metric-card blue">
                  <div className="metric-head">
                    <span className="metric-label">Total Customers</span>
                    <span>◌</span>
                  </div>
                  <div className="metric-value">{data.summary.customers.total}</div>
                  <div className="metric-note">Channel identities: <strong>{data.summary.identities}</strong></div>
                </article>
                <article className="metric-card green">
                  <div className="metric-head">
                    <span className="metric-label">Qualified</span>
                    <span>◌</span>
                  </div>
                  <div className="metric-value">{data.summary.customers.qualified}</div>
                  <div className="metric-note">Conversations tracked: <strong>{data.summary.conversations}</strong></div>
                </article>
                <article className="metric-card amber">
                  <div className="metric-head">
                    <span className="metric-label">Pending CRM Sync</span>
                    <span>◌</span>
                  </div>
                  <div className="metric-value">{data.summary.customers.pendingSync}</div>
                  <div className="metric-note">Customers awaiting sync or review</div>
                </article>
              </section>

              <section className="toolbar">
                <div className="toolbar-group">
                  {channelChips.map(([channel, count]) => (
                    <button
                      key={channel}
                      type="button"
                      className={`chip ${activeChip === channel ? 'active' : ''}`}
                      onClick={() => {
                        const next = activeChip === channel ? '' : channel
                        setActiveChip(next)
                        setChannelFilter(next)
                      }}
                    >
                      {channelLabel(channel as ChannelName)}
                      <strong>{count}</strong>
                    </button>
                  ))}
                  <select id="channelFilter" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                    <option value="">All Channels</option>
                    {channelChips.map(([channel]) => (
                      <option key={channel} value={channel}>{channelLabel(channel as ChannelName)}</option>
                    ))}
                  </select>
                  <select id="statusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="new">New</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="qualified">Qualified</option>
                    <option value="unqualified">Unqualified</option>
                  </select>
                  <select id="crmFilter" value={crmFilter} onChange={(event) => setCrmFilter(event.target.value)}>
                    <option value="">CRM State</option>
                    <option value="pending">Pending</option>
                    <option value="synced">Synced</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div className="toolbar-group">
                  <input
                    id="search"
                    type="search"
                    placeholder="Search customers"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <span id="resultCount" style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>
                    Showing {filtered.length} customer{filtered.length === 1 ? '' : 's'}
                  </span>
                  <button id="clearFilters" className="btn link" type="button" style={{ color: '#4f46e5', fontWeight: 700 }} onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              </section>

              <section id="leadList" className="lead-list">
                {filtered.length === 0 && <div className="empty">No customers captured yet.</div>}
                {filtered.map((customer: CustomerRecord) => {
                  const identities = identitiesByCustomer.get(customer.id) ?? []
                  const contact = customer.phone ?? customer.email ?? customer.id
                  const service = customer.preferredService ?? 'No interest captured yet'
                  const whatsappLink = buildWhatsappLink(customer.phone)

                  return (
                    <article key={customer.id} className="lead-card">
                      <div className="lead-main">
                        <div className="lead-avatar">{customerInitials(customer)}</div>
                        <div>
                          <div className="lead-heading">
                            <div className="lead-title">{customerName(customer)}</div>
                            <span className={`pill ${statusTone(customer.qualificationStatus)}`}>{customer.qualificationStatus}</span>
                          </div>
                          <div className="lead-meta">
                            <span>{contact}</span>
                            <strong>{service}</strong>
                          </div>
                          <div className="identity-list" style={{ marginTop: 10 }}>
                            {identities.map((identity) => {
                              const label = identity.username ? `@${identity.username}` : identity.sourceId
                              return (
                                <span key={identity.id} className="identity-chip" title={identity.sourceId}>
                                  <span className="channel-icon">{iconDot(identity.channel)}</span>
                                  <span>{label}</span>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="lead-side">
                        <span className={`pill ${statusTone(customer.crmStatus)}`}>{customer.crmStatus}</span>
                        <div className="lead-side-actions">
                          {whatsappLink && (
                            <a className="btn" href={whatsappLink} target="_blank" rel="noreferrer">WhatsApp</a>
                          )}
                          {customer.email && (
                            <a className="btn" href={`mailto:${customer.email}`}>Email</a>
                          )}
                          <a className="btn dark" href={`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'}/reports/leads-dashboard/${customer.id}`}>
                            Review Lead
                          </a>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
