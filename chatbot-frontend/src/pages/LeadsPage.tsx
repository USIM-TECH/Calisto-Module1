import { Clock3, Download, Mail, Search, UserRoundCheck, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getLeads } from '../api/client'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { ChannelIcon, WhatsAppIcon } from '../components/ChannelIcon'
import PageContainer from '../components/PageContainer'
import Pagination from '../components/Pagination'
import Select from '../components/Select'
import { SkeletonFilterBar, SkeletonStatsCard, SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import { downloadLeadsXlsx } from '../lib/export-leads-xlsx'
import { formatIntent } from '../lib/format'
import { identityLabel } from '../lib/identity'
import { pageSlice, useTablePaging } from '../lib/table-paging'
import type { ChannelIdentityRecord, CustomerRecord, LeadsResponse } from '../types'

type ChannelName = ChannelIdentityRecord['channel']

// Fixed one-line row height; rows per page = fit the screen, or the size picked in the footer (useTablePaging).
const ROW_HEIGHT_PX = 64

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
    <article className="flex items-center gap-4 rounded-2xl border border-calisto-line-subtle bg-calisto-surface px-5 py-4 shadow-dashboard">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold uppercase tracking-wider text-calisto-muted">{label}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-2xl font-semibold leading-none text-indigo-900">{value}</span>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${trendClass}`}>{trend}</span>
        </div>
      </div>
    </article>
  )
}

function ChannelBadge({ identity }: { identity: ChannelIdentityRecord }) {
  const value = identityLabel(identity)

  return (
    <span
      className="inline-flex max-w-[12rem] items-center gap-1.5 truncate rounded-md border border-calisto-line bg-calisto-surface px-2.5 py-1 text-xs font-medium text-calisto-body"
      title={`${channelName(identity.channel)} ${identity.sourceId}`}
    >
      <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${channelColors[identity.channel]}`}>
        <ChannelIcon channel={identity.channel} className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{value}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${statusTones[status] ?? statusTones.pending}`}>
      {statusLabel(status)}
    </span>
  )
}

function SearchFilters({
  channel,
  channels,
  onChannelChange,
  onClear,
  onExport,
  exportDisabled,
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
  onExport: () => void
  exportDisabled: boolean
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
            className="h-11 w-full rounded-lg border border-calisto-line bg-calisto-surface pl-10 pr-4 text-sm text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/30 focus:ring-4 focus:ring-calisto-focus"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search customers..."
            type="search"
            value={search}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <Select
            aria-label="Filter by channel"
            onChange={onChannelChange}
            options={[{ value: '', label: 'All Channels' }, ...channels]}
            value={channel}
          />

          <Select
            aria-label="Filter by status"
            onChange={onStatusChange}
            options={[{ value: '', label: 'All Statuses' }, ...statuses]}
            value={status}
          />

          {/* Clear and Export share one style so they read as a pair of toolbar actions. */}
          <Button className="h-11" icon={<X className="h-4 w-4" />} onClick={onClear} variant="primary">
            Clear
          </Button>
          <Button className="h-11" disabled={exportDisabled} icon={<Download className="h-4 w-4" />} onClick={onExport} variant="primary">
            Export
          </Button>
        </div>
      </div>
    </section>
  )
}

function LeadsTable({
  headerRef,
  paging,
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
  headerRef: React.MutableRefObject<HTMLTableSectionElement | null>
  paging: ReturnType<typeof useTablePaging>
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
    <section className="flex flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard lg:min-h-0 lg:flex-1">
      <div className="table-scroll flex flex-col overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto" {...paging.scrollProps}>
        <table className="table-edges w-full min-w-[980px] table-fixed border-collapse text-left text-sm lg:min-w-0">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-calisto-surface" ref={headerRef}>
            <tr className="bg-calisto-table/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
              <th className="px-4 py-4">Customer</th>
              <th className="px-4 py-4">Identity / Channel</th>
              <th className="px-4 py-4">Intent</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Contact</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-calisto-line-subtle">
            {customers.map((customer) => {
              const identities = identitiesByCustomer.get(customer.id) ?? []
              const whatsappLink = buildWhatsappLink(customer.phone)

              return (
                <tr key={customer.id} className="border-b border-calisto-line-subtle transition hover:bg-calisto-surface-muted" style={{ height: ROW_HEIGHT_PX }}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-calisto-surface">
                        {customerInitials(customer)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-calisto-ink">{customerName(customer)}</div>
                        {customer.location && (
                          <div className="truncate text-xs text-calisto-muted">{customer.location}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex min-w-0 gap-2 overflow-hidden">
                      {identities.length > 0 ? (
                        identities.slice(0, 2).map((identity) => <ChannelBadge identity={identity} key={identity.id} />)
                      ) : (
                        <span className="text-xs text-calisto-soft">No channel identity</span>
                      )}
                    </div>
                  </td>
                  <td className="truncate px-4 py-2 text-calisto-body">
                    {customer.lastIntent || customer.preferredService
                      ? formatIntent((customer.lastIntent || customer.preferredService)!)
                      : <span className="text-calisto-soft">—</span>}
                  </td>
                  <td className="px-4 py-2"><StatusBadge status={customer.qualificationStatus} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {!whatsappLink && !customer.email && (
                        <span className="text-calisto-soft" title="No phone or email captured yet">—</span>
                      )}
                      {whatsappLink && (
                        <a
                          aria-label={`WhatsApp ${customerName(customer)}`}
                          title={`WhatsApp ${customer.phone}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-calisto-surface text-emerald-600 transition hover:bg-emerald-50"
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
                          title={`Email ${customer.email}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-calisto-surface text-blue-700 transition hover:bg-blue-50"
                          href={`mailto:${customer.email}`}
                        >
                          <Mail className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-calisto-accent/20 bg-calisto-surface px-3 text-sm font-semibold text-calisto-accent transition hover:bg-calisto-accent/10"
                      state={{ fromLeads: true }}
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
        {customers.length === 0 && <EmptyState />}
      </div>
      {customers.length > 0 && (
        <Pagination
          {...paging.pagination}
          currentPage={currentPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          pageCount={pageCount}
          totalCount={totalCount}
          visibleEnd={visibleEnd}
          visibleStart={visibleStart}
        />
      )}
    </section>
  )
}

export default function LeadsPage() {
  const [data, setData] = useState<LeadsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const paging = useTablePaging(tableHeaderRef, Boolean(data))
  const rowsPerPage = paging.rowsPerPage

  // Filters and page live in the URL so "Back to leads" (and refresh) restore them.
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const channelFilter = params.get('channel') ?? ''
  const statusFilter = params.get('status') ?? ''
  const currentPage = Math.max(1, Number(params.get('page')) || 1)

  function updateParams(changes: Record<string, string | number | null>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(changes)) {
        if (!value || (key === 'page' && value === 1)) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    }, { replace: true })
  }

  // Changing a filter starts again from page 1.
  const setSearch = (value: string) => updateParams({ q: value, page: null })
  const setChannelFilter = (value: string) => updateParams({ channel: value, page: null })
  const setStatusFilter = (value: string) => updateParams({ status: value, page: null })
  const setCurrentPage = (page: number) => updateParams({ page })

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
          customer.lastIntent && formatIntent(customer.lastIntent),
          ...identities.map((identity) => identity.sourceId),
          ...identities.map((identity) => identityLabel(identity)),
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

  const { pageCount, pageItems: paginated, visibleStart, visibleEnd } = pageSlice(filtered, rowsPerPage, currentPage)

  useEffect(() => {
    // Wait for data: before it loads pageCount is 1 and would reset a restored page.
    if (data && currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [data, currentPage, pageCount])

  function clearFilters() {
    updateParams({ q: null, channel: null, status: null, page: null })
  }

  function handleExport() {
    if (!data) return
    downloadLeadsXlsx(data.customers, identitiesByCustomer)
  }

  return (
    // On desktop the page fills the screen; the table takes the remaining height and pages.
    <PageContainer className="lg:flex lg:h-[100dvh] lg:flex-col">
      <Topbar
        title="Lead Operations Dashboard"
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {!data && !error && (
        <>
          <SkeletonTopbar />
          <section className="mb-6 grid gap-5 md:grid-cols-3">
            <SkeletonStatsCard />
            <SkeletonStatsCard />
            <SkeletonStatsCard />
          </section>
          <SkeletonFilterBar />
          <SkeletonTable
            cols={6}
            rows={5}
            headers={['Customer', 'Identity / Channel', 'Intent', 'Status', 'Contact', 'Actions']}
          />
        </>
      )}

      {data && (
        <>
          <section className="mb-5 grid gap-4 md:grid-cols-3">
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
            onExport={handleExport}
            exportDisabled={data.customers.length === 0}
            onSearchChange={setSearch}
            onStatusChange={setStatusFilter}
            search={search}
            status={statusFilter}
            statuses={statusOptions}
          />

          <LeadsTable
            headerRef={tableHeaderRef}
            paging={paging}
            customers={paginated}
            currentPage={currentPage}
            identitiesByCustomer={identitiesByCustomer}
            onNextPage={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
            onPreviousPage={() => setCurrentPage(Math.max(1, currentPage - 1))}
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

