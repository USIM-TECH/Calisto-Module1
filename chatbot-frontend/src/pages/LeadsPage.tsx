import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Mail, RefreshCw, Search, UserRoundCheck, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLeads } from '../api/client'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import Topbar from '../components/Topbar'
import type { ChannelIdentityRecord, CustomerRecord, LeadsResponse } from '../types'

type ChannelName = ChannelIdentityRecord['channel']

const PAGE_SIZE = 5

interface FilterOption {
  label: string
  value: string
}

interface StatsCardProps {
  icon: LucideIcon
  label: string
  trend: string
  trendTone?: 'positive' | 'negative'
  value: string | number
}

const statusOptions = [
  { label: 'New', value: 'new' },
  { label: 'Needs Review', value: 'needs_review' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Unqualified', value: 'unqualified' },
]

const channelLabels: Record<ChannelIdentityRecord['channel'], string> = {
  instagram: 'IG',
  messenger: 'MS',
  telegram: 'TG',
  website: 'WEB',
  whatsapp: 'WA',
  x: 'X',
}

const channelColors: Record<ChannelIdentityRecord['channel'], string> = {
  instagram: 'text-purple-700',
  messenger: 'text-blue-700',
  telegram: 'text-sky-700',
  website: 'text-teal-700',
  whatsapp: 'text-emerald-700',
  x: 'text-calisto-body',
}

const statusTones: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 ring-blue-200',
  needs_review: 'bg-amber-50 text-amber-700 ring-amber-200',
  qualified: 'bg-violet-100 text-violet-700 ring-violet-200',
  unqualified: 'bg-rose-50 text-rose-700 ring-rose-200',
  converted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  synced: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-calisto-table text-calisto-body ring-calisto-line',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  inactive: 'bg-calisto-table text-calisto-body ring-calisto-line',
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

function percent(part: number, total: number) {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function channelName(channel: ChannelIdentityRecord['channel']) {
  const names: Record<ChannelIdentityRecord['channel'], string> = {
    instagram: 'Instagram',
    messenger: 'Messenger',
    telegram: 'Telegram',
    website: 'Website',
    whatsapp: 'WhatsApp',
    x: 'X',
  }
  return names[channel]
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildWhatsappLink(phone?: string) {
  if (!phone) return undefined
  const digits = phone.replace(/[^\d]/g, '')
  return digits ? `https://wa.me/${digits}` : undefined
}

function customerName(customer: CustomerRecord) {
  return customer.leadName ?? customer.email ?? customer.phone ?? 'Unknown Customer'
}

function customerInitials(customer: CustomerRecord) {
  return customerName(customer)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function StatsCard({ icon: Icon, label, trend, trendTone = 'positive', value }: StatsCardProps) {
  const trendClass = trendTone === 'positive'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-calisto-accent/10 text-calisto-accent'

  return (
    <article className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-6 shadow-dashboard">
      <div className="mb-5 flex items-start justify-between gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${trendClass}`}>{trend}</span>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-calisto-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold leading-none text-indigo-900">{value}</div>
    </article>
  )
}

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.051 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.889-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.887 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

function ChannelBadge({ identity }: { identity: ChannelIdentityRecord }) {
  const value = identity.username ? `@${identity.username}` : identity.sourceId

  return (
    <span
      className="inline-flex max-w-[12rem] items-center gap-1.5 truncate rounded-md border border-calisto-line bg-calisto-surface px-2.5 py-1 text-xs font-medium text-calisto-body"
      title={`${channelName(identity.channel)} ${identity.sourceId}`}
    >
      <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${channelColors[identity.channel]}`}>
        {identity.channel === 'whatsapp' ? <WhatsAppIcon className="h-3.5 w-3.5" /> : (
          <span className="text-[0.65rem] font-black">{channelLabels[identity.channel]}</span>
        )}
      </span>
      <span className="truncate">{value}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${statusTones[status] ?? statusTones.pending}`}>
      {statusLabel(status)}
    </span>
  )
}

function SearchFilters({
  channel,
  channels,
  onChannelChange,
  onClear,
  onSearchChange,
  onStatusChange,
  search,
  status,
  statuses,
}: {
  channel: string
  channels: FilterOption[]
  onChannelChange: (value: string) => void
  onClear: () => void
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  search: string
  status: string
  statuses: FilterOption[]
}) {
  return (
    <section className="mb-5 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-calisto-soft" />
          <input
            className="h-11 w-full rounded-lg border border-transparent bg-calisto-table pl-10 pr-4 text-sm text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/30 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search customers..."
            type="search"
            value={search}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <select
            className="h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
            onChange={(event) => onChannelChange(event.target.value)}
            value={channel}
          >
            <option value="">All Channels</option>
            {channels.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            className="h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
            onChange={(event) => onStatusChange(event.target.value)}
            value={status}
          >
            <option value="">All Statuses</option>
            {statuses.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <Button className="px-3" icon={<X className="h-4 w-4" />} onClick={onClear} variant="ghost">
            Clear
          </Button>
        </div>
      </div>
    </section>
  )
}

function LeadsTable({
  customers,
  currentPage,
  identitiesByCustomer,
  onNextPage,
  onPreviousPage,
  pageCount,
  totalCount,
  visibleEnd,
  visibleStart,
}: {
  customers: CustomerRecord[]
  currentPage: number
  identitiesByCustomer: Map<string, ChannelIdentityRecord[]>
  onNextPage: () => void
  onPreviousPage: () => void
  pageCount: number
  totalCount: number
  visibleEnd: number
  visibleStart: number
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
              <th className="px-7 py-5">Customer</th>
              <th className="px-7 py-5">Identity / Channel</th>
              <th className="px-7 py-5">Intent</th>
              <th className="px-7 py-5">Status</th>
              <th className="px-7 py-5">Contact</th>
              <th className="px-7 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-calisto-line-subtle">
            {customers.length === 0 && (
              <tr>
                <td className="px-7 py-12 text-center text-sm font-medium text-calisto-muted" colSpan={6}>
                  No customers match these filters.
                </td>
              </tr>
            )}

            {customers.map((customer) => {
              const identities = identitiesByCustomer.get(customer.id) ?? []
              const whatsappLink = buildWhatsappLink(customer.phone)

              return (
                <tr key={customer.id} className="transition hover:bg-calisto-surface-muted">
                  <td className="px-7 py-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-calisto-surface">
                        {customerInitials(customer)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-calisto-ink">{customerName(customer)}</div>
                        <div className="truncate text-xs text-calisto-muted">{customer.location ?? 'No location'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-7 py-4">
                    <div className="flex max-w-xs flex-wrap gap-2">
                      {identities.length > 0 ? (
                        identities.slice(0, 2).map((identity) => <ChannelBadge identity={identity} key={identity.id} />)
                      ) : (
                        <span className="text-xs text-calisto-soft">No channel identity</span>
                      )}
                    </div>
                  </td>
                  <td className="px-7 py-4 text-calisto-body">{customer.lastIntent ?? customer.preferredService ?? 'Return Request'}</td>
                  <td className="px-7 py-4"><StatusBadge status={customer.qualificationStatus} /></td>
                  <td className="px-7 py-4">
                    <div className="flex items-center gap-2">
                      {whatsappLink && (
                        <a
                          aria-label={`WhatsApp ${customerName(customer)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-calisto-surface text-emerald-600 transition hover:bg-emerald-50"
                          href={whatsappLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <WhatsAppIcon />
                        </a>
                      )}
                      {customer.email && (
                        <a
                          aria-label={`Email ${customerName(customer)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                          href={`mailto:${customer.email}`}
                        >
                          <Mail className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-7 py-4 text-right">
                    <Link
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-calisto-accent/20 bg-calisto-surface px-4 text-sm font-semibold text-calisto-accent transition hover:bg-calisto-accent/10"
                      to={`/leads/${customer.id}`}
                    >
                      Review Lead
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-calisto-line-subtle px-5 py-4 text-sm text-calisto-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="font-semibold">
          Showing {visibleStart}-{visibleEnd} of {totalCount}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-calisto-line bg-calisto-surface px-3 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onPreviousPage}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className="min-w-24 text-center text-sm font-semibold text-calisto-body">
            Page {currentPage} of {pageCount}
          </span>
          <button
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-calisto-line bg-calisto-surface px-3 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onNextPage}
            disabled={currentPage === pageCount}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}

export default function LeadsPage() {
  const [data, setData] = useState<LeadsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    getLeads()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  const identitiesByCustomer = useMemo(() => {
    if (!data) return new Map<string, ChannelIdentityRecord[]>()
    return buildIdentitiesByCustomer(data.identities)
  }, [data])

  const channelOptions = useMemo(() => {
    if (!data) return []
    return Object.keys(data.summary.channels).map((channel) => ({
      label: channelName(channel as ChannelName),
      value: channel,
    }))
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()

    return data.customers
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter((customer: CustomerRecord) => {
        const identities = identitiesByCustomer.get(customer.id) ?? []
        const matchesQuery = !term || [
          customerName(customer),
          customer.phone,
          customer.email,
          customer.preferredService,
          customer.location,
          customer.lastIntent,
          ...identities.map((identity) => identity.sourceId),
          ...identities.map((identity) => identity.username ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)

        const matchesStatus = !statusFilter || customer.qualificationStatus === statusFilter
        const channels = new Set(identities.map((identity) => identity.channel))
        const matchesChannel = !channelFilter || channels.has(channelFilter as ChannelName)

        return matchesQuery && matchesStatus && matchesChannel
      })
  }, [channelFilter, data, identitiesByCustomer, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const visibleStart = filtered.length === 0 ? 0 : pageStart + 1
  const visibleEnd = Math.min(pageStart + PAGE_SIZE, filtered.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [channelFilter, search, statusFilter])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  function clearFilters() {
    setSearch('')
    setChannelFilter('')
    setStatusFilter('')
  }

  return (
    <PageContainer>
      <Topbar
        title="Lead Operations Dashboard"
        actions={(
          <>
            <Button icon={<RefreshCw className="h-4 w-4" />} variant="secondary">Sync Data</Button>
            <Button icon={<Download className="h-4 w-4" />} variant="primary">Export</Button>
          </>
        )}
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-8 text-sm font-medium text-calisto-muted shadow-sm">
          Loading lead operations...
        </div>
      )}

      {data && (
        <>
          <section className="mb-6 grid gap-5 md:grid-cols-3">
            <StatsCard
              icon={UsersRound}
              label="Total Customers"
              trend="+12.4%"
              value={data.summary.customers.total}
            />
            <StatsCard
              icon={UserRoundCheck}
              label="Qualified Leads"
              trend={percent(data.summary.customers.qualified, data.summary.customers.total)}
              value={data.summary.customers.qualified}
            />
            <StatsCard
              icon={Clock3}
              label="Pending CRM Sync"
              trend={percent(data.summary.customers.pendingSync, data.summary.customers.total)}
              trendTone={data.summary.customers.pendingSync > 0 ? 'negative' : 'positive'}
              value={data.summary.customers.pendingSync}
            />
          </section>

          <SearchFilters
            channel={channelFilter}
            channels={channelOptions}
            onChannelChange={setChannelFilter}
            onClear={clearFilters}
            onSearchChange={setSearch}
            onStatusChange={setStatusFilter}
            search={search}
            status={statusFilter}
            statuses={statusOptions}
          />

          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-calisto-muted">
            <span>{filtered.length} customer{filtered.length === 1 ? '' : 's'} shown</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {data.summary.conversations} conversations tracked
            </span>
          </div>

          <LeadsTable
            customers={paginated}
            currentPage={currentPage}
            identitiesByCustomer={identitiesByCustomer}
            onNextPage={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
            onPreviousPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
            pageCount={pageCount}
            totalCount={filtered.length}
            visibleEnd={visibleEnd}
            visibleStart={visibleStart}
          />
        </>
      )}
    </PageContainer>
  )
}

