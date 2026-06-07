import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getLeadDetail } from '../api/client'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import Topbar from '../components/Topbar'
import type { ConversationMessageRecord, LeadDetailResponse } from '../types'

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function customerName(detail: LeadDetailResponse | null) {
  if (!detail) return 'Customer detail'
  const { customer, identities } = detail
  return customer.leadName ?? identities.find((identity) => identity.senderName)?.senderName ?? customer.email ?? customer.phone ?? 'Unknown'
}

function statusTone(status: string) {
  if (status === 'qualified' || status === 'synced') return 'bg-emerald-50 text-emerald-700'
  if (status === 'failed' || status === 'unqualified') return 'bg-rose-50 text-rose-700'
  if (status === 'needs_review') return 'bg-amber-50 text-amber-700'
  return 'bg-calisto-table text-calisto-body'
}

function channelLabel(channel: string) {
  switch (channel) {
    case 'whatsapp': return 'WhatsApp'
    case 'instagram': return 'Instagram'
    case 'messenger': return 'Messenger'
    case 'telegram': return 'Telegram'
    case 'website': return 'Website'
    case 'x': return 'X'
    default: return channel
  }
}

function channelDot(channel: string) {
  switch (channel) {
    case 'whatsapp': return 'wa'
    case 'instagram': return 'ig'
    case 'messenger': return 'ms'
    case 'telegram': return 'tg'
    case 'website': return 'web'
    case 'x': return 'x'
    default: return 'id'
  }
}

function renderTranscriptMessage(message: ConversationMessageRecord) {
  const isOutbound = message.direction === 'outbound'
  const wrapperClass = isOutbound ? 'items-end' : 'items-start'
  const bubbleClass = isOutbound
    ? 'rounded-tr-md bg-blue-600 text-white'
    : 'rounded-tl-md bg-slate-200 text-calisto-ink'
  const label = isOutbound ? 'Outbound (AI Assistant)' : 'Inbound'

  return (
    <div key={message.messageId} className={`flex flex-col gap-1 ${wrapperClass}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-sm leading-6 shadow-sm ${bubbleClass}`}>
        {message.text ?? `[${message.messageType}]`}
      </div>
      <div className="px-1 text-[11px] font-semibold text-calisto-soft">
        {label} - {formatDate(message.timestamp)}
      </div>
    </div>
  )
}

export default function LeadDetailPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const [data, setData] = useState<LeadDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!customerId) {
        setLoadError('Missing customer id')
        setLoading(false)
        return
      }

      setLoading(true)
      setLoadError(null)

      try {
        const detail = await getLeadDetail(customerId)
        if (!cancelled) setData(detail)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load lead detail')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [customerId])

  const interestsByKind = useMemo(() => {
    const map = new Map<string, LeadDetailResponse['interests']>()
    if (!data) return map
    for (const interest of data.interests) {
      const list = map.get(interest.kind) ?? []
      list.push(interest)
      map.set(interest.kind, list)
    }
    return map
  }, [data])

  if (loading) {
    return (
      <PageContainer>
        <Topbar title="Lead detail" />
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-8 text-sm font-medium text-calisto-muted shadow-sm">
          Loading lead details...
        </div>
      </PageContainer>
    )
  }

  if (loadError) {
    return (
      <PageContainer>
        <Topbar title="Lead detail" />
        <div className="rounded-2xl border border-rose-100 bg-calisto-surface p-5 text-sm font-medium text-rose-700 shadow-sm">
          {loadError}
        </div>
      </PageContainer>
    )
  }

  if (!data) {
    return (
      <PageContainer>
        <Topbar title="Lead detail" />
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-8 text-sm font-medium text-calisto-muted shadow-sm">
          Customer not found.
        </div>
      </PageContainer>
    )
  }

  const { customer, identities, transcript, crm } = data

  return (
    <PageContainer>
      <Topbar
        title="Lead detail"
        actions={(
          <>
            <Link to="/leads" className="inline-flex items-center text-sm font-semibold text-calisto-muted">
              Back to Leads
            </Link>
            <Button className="ml-3" variant="secondary">Share</Button>
            <Button className="ml-2" variant="secondary">Notify</Button>
          </>
        )}
      />

      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-3xl font-extrabold leading-none tracking-normal text-calisto-ink">{customerName(data)}</h2>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${statusTone(customer.qualificationStatus)}`}>
            {customer.qualificationStatus}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Push to CRM</Button>
          <Button>Actions</Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <div className="grid gap-6">
          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <div className="flex items-center justify-between gap-4 border-b border-calisto-line px-6 py-5">
              <h3 className="text-base font-extrabold text-calisto-ink">Customer Overview</h3>
              <a href="#" className="text-sm font-semibold text-calisto-accent">Edit Info</a>
            </div>

            <div className="grid gap-x-7 gap-y-6 p-6 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Customer ID</div>
                <div className="break-words text-sm font-semibold text-calisto-body">{customer.id}</div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Channels</div>
                <div className="flex flex-wrap gap-2">
                  {identities.length > 0 ? identities.map((identity) => (
                    <span
                      key={identity.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-full bg-calisto-table py-1 pl-1 pr-3 text-xs font-semibold text-calisto-body"
                      title={`${channelLabel(identity.channel)} ${identity.sourceId}`}
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[10px] font-extrabold uppercase text-cyan-700">
                        {channelDot(identity.channel)}
                      </span>
                      <span className="truncate">{identity.username ? `@${identity.username}` : identity.sourceId}</span>
                    </span>
                  )) : <div className="text-sm italic text-calisto-soft">No channel identities</div>}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Latest Interest</div>
                <div className={`break-words text-sm font-semibold ${customer.preferredService ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.preferredService ?? 'Not captured'}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">First Seen</div>
                <div className="break-words text-sm font-semibold text-calisto-body">{formatDate(customer.firstSeenAt)}</div>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Location</div>
                <div className={`break-words text-sm font-semibold ${customer.location ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.location ?? 'Not provided'}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Email</div>
                <div className={`break-words text-sm font-semibold ${customer.email ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.email ?? 'Not provided'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Phone</div>
                <div className={`break-words text-sm font-semibold ${customer.phone ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.phone ?? 'Not provided'}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <div className="flex items-center justify-between gap-4 border-b border-calisto-line px-6 py-5">
              <h3 className="text-base font-extrabold text-calisto-ink">Captured Interests</h3>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">
                {data.interests.length} entries
              </span>
            </div>

            <div className="p-6">
              {data.interests.length === 0 ? (
                <div className="text-sm italic text-calisto-soft">No interests captured yet.</div>
              ) : (
                <div className="space-y-4">
                  {Array.from(interestsByKind.entries()).map(([kind, items]) => (
                    <div key={kind}>
                      <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">{kind.replace(/_/g, ' ')}</div>
                      <div className="flex flex-wrap gap-2">
                        {items.map((item) => (
                          <span
                            key={item.id}
                            className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700"
                            title={formatDate(item.capturedAt)}
                          >
                            {item.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <div className="flex items-center justify-between gap-4 border-b border-calisto-line px-6 py-5">
              <h3 className="text-base font-extrabold text-calisto-ink">CRM Integration</h3>
            </div>

            <div className="p-6">
              <div className="grid gap-x-7 gap-y-6 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">CRM Status</div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${statusTone(crm.status)}`}>
                    {crm.status}
                  </span>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">CRM Record</div>
                  <div className={`break-words text-sm font-semibold ${crm.recordId ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                    {crm.recordId ?? 'No match found'}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Last Intent</div>
                  <div className={`break-words text-sm font-semibold ${customer.lastIntent ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                    {customer.lastIntent ?? 'Not captured'}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Last Activity</div>
                  <div className="break-words text-sm font-semibold text-calisto-body">{formatDate(customer.lastMessageAt)}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="primary">Push to CRM</Button>
                <Button>Mark Invalid</Button>
                {customer.email && (
                  <a
                    className="inline-flex h-10 items-center rounded-xl border border-calisto-line bg-calisto-surface px-4 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted"
                    href={`mailto:${customer.email}`}
                  >
                    Send Email
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside>
          <section className="flex min-h-[640px] overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard xl:sticky xl:top-6">
            <div className="flex min-h-0 w-full flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-calisto-line px-6 py-5">
                <h3 className="text-base font-extrabold text-calisto-ink">Recent Transcript</h3>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">
                  {transcript.length} messages
                </span>
              </div>

              {transcript.length === 0 ? (
                <div className="flex-1 bg-calisto-table p-6 text-sm italic text-calisto-soft">No transcript available yet.</div>
              ) : (
                <div className="flex max-h-[640px] flex-1 flex-col gap-4 overflow-y-auto bg-calisto-table p-6">
                  {transcript.map((message) => renderTranscriptMessage(message))}
                </div>
              )}

              <div className="border-t border-calisto-line bg-calisto-surface p-4">
                <input
                  className="h-12 w-full rounded-xl border border-calisto-line bg-calisto-table px-3.5 text-sm text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-orange-300 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  placeholder="Internal note or reply..."
                  type="text"
                />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PageContainer>
  )
}
