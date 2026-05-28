import { CheckCircle2, Download, RefreshCw, UsersRound, UserRoundCheck, Clock3 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getLeads } from '../api/client'
import Button from '../components/Button'
import { channelName } from '../components/ChannelBadge'
import LeadsTable, { getCustomerName } from '../components/LeadsTable'
import PageContainer from '../components/PageContainer'
import SearchFilters from '../components/SearchFilters'
import StatsCard from '../components/StatsCard'
import Topbar from '../components/Topbar'
import type { ChannelIdentityRecord, CustomerRecord, LeadsResponse } from '../types'

type ChannelName = ChannelIdentityRecord['channel']

const statusOptions = [
  { label: 'New', value: 'new' },
  { label: 'Needs Review', value: 'needs_review' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Unqualified', value: 'unqualified' },
]

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

export default function LeadsPage() {
  const [data, setData] = useState<LeadsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

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
          getCustomerName(customer),
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
        <div className="mb-5 rounded-2xl border border-rose-100 bg-white p-5 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-sm font-medium text-slate-500 shadow-sm">
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

          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>{filtered.length} customer{filtered.length === 1 ? '' : 's'} shown</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {data.summary.conversations} conversations tracked
            </span>
          </div>

          <LeadsTable customers={filtered} identitiesByCustomer={identitiesByCustomer} />
        </>
      )}
    </PageContainer>
  )
}
