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

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.051 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.889-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.887 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

function renderTranscriptMessage(message: ConversationMessageRecord) {
  const isOutbound = message.direction === 'outbound'
  const wrapperClass = isOutbound ? 'items-end' : 'items-start'
  const bubbleClass = isOutbound
    ? 'rounded-tr-md bg-calisto-accent text-calisto-surface shadow-[0_8px_18px_rgba(234,88,12,0.18)]'
    : 'rounded-tl-md border border-calisto-line bg-calisto-surface text-calisto-ink shadow-sm'
  const label = isOutbound ? 'Outbound (AI Assistant)' : 'Inbound'

  return (
    <div key={message.messageId} className={`flex flex-col gap-1.5 ${wrapperClass}`}>
      <div className={`max-w-[82%] whitespace-pre-wrap rounded-[20px] px-4 py-3 text-sm font-medium leading-6 ${bubbleClass}`}>
        {message.text ?? `[${message.messageType}]`}
      </div>
      <div className="px-1 text-[11px] font-semibold leading-none text-calisto-muted">
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,1fr)] 2xl:grid-cols-[minmax(0,1.15fr)_minmax(480px,1fr)]">
        <div className="grid gap-5">
          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <div className="flex items-center justify-between gap-4 border-b border-calisto-line bg-calisto-surface px-5 py-4">
              <h3 className="text-base font-extrabold text-calisto-ink">Customer Overview</h3>
              <a href="#" className="text-sm font-semibold text-calisto-accent">Edit Info</a>
            </div>

            <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Customer ID</div>
                <div className="break-words font-mono text-[0.82rem] font-semibold text-calisto-body">{customer.id}</div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Channels</div>
                <div className="flex flex-wrap gap-2">
                  {identities.length > 0 ? identities.map((identity) => (
                    <span
                      key={identity.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-calisto-line bg-calisto-table py-1 pl-1 pr-3 text-xs font-bold text-calisto-body"
                      title={`${channelLabel(identity.channel)} ${identity.sourceId}`}
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[10px] font-extrabold uppercase text-cyan-700">
                        {identity.channel === 'whatsapp' ? <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-700" /> : channelDot(identity.channel)}
                      </span>
                      <span className="truncate">{identity.username ? `@${identity.username}` : identity.sourceId}</span>
                    </span>
                  )) : <div className="text-sm italic text-calisto-soft">No channel identities</div>}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Latest Interest</div>
                <div className={`break-words text-sm font-semibold ${customer.preferredService ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.preferredService ?? 'Not captured'}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">First Seen</div>
                <div className="break-words text-sm font-semibold text-calisto-body">{formatDate(customer.firstSeenAt)}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Location</div>
                <div className={`break-words text-sm font-semibold ${customer.location ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.location ?? 'Not provided'}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Email</div>
                <div className={`break-words text-sm font-semibold ${customer.email ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.email ?? 'Not provided'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Phone</div>
                <div className={`break-words text-sm font-semibold ${customer.phone ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                  {customer.phone ?? 'Not provided'}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
            <div className="flex items-center justify-between gap-4 border-b border-calisto-line bg-calisto-surface px-5 py-4">
              <h3 className="text-base font-extrabold text-calisto-ink">Captured Interests</h3>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">
                {data.interests.length} entries
              </span>
            </div>

            <div className="p-5">
              {data.interests.length === 0 ? (
                <div className="text-sm italic text-calisto-soft">No interests captured yet.</div>
              ) : (
                <div className="space-y-3.5">
                  {Array.from(interestsByKind.entries()).map(([kind, items]) => (
                    <div key={kind}>
                      <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">{kind.replace(/_/g, ' ')}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {items.map((item) => (
                          <span
                            key={item.id}
                            className="inline-flex max-w-full items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-extrabold text-orange-700 shadow-sm"
                            title={formatDate(item.capturedAt)}
                          >
                            <span className="truncate">{item.value}</span>
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
            <div className="flex items-center justify-between gap-4 border-b border-calisto-line bg-calisto-surface px-5 py-4">
              <h3 className="text-base font-extrabold text-calisto-ink">CRM Integration</h3>
            </div>

            <div className="p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="rounded-xl border border-calisto-line-subtle bg-calisto-table/70 px-3 py-2.5">
                    <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">CRM Status</div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${statusTone(crm.status)}`}>
                      {crm.status}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-calisto-line-subtle bg-calisto-table/70 px-3 py-2.5">
                  <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">CRM Record</div>
                  <div className={`break-words text-sm font-semibold ${crm.recordId ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                    {crm.recordId ?? 'No match found'}
                  </div>
                </div>
                <div className="rounded-xl border border-calisto-line-subtle bg-calisto-table/70 px-3 py-2.5">
                  <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Last Intent</div>
                  <div className={`break-words text-sm font-semibold ${customer.lastIntent ? 'text-calisto-body' : 'italic text-calisto-soft'}`}>
                    {customer.lastIntent ?? 'Not captured'}
                  </div>
                </div>
                <div className="rounded-xl border border-calisto-line-subtle bg-calisto-table/70 px-3 py-2.5">
                  <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">Last Activity</div>
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
          <section className="flex min-h-[760px] overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard xl:sticky xl:top-6 xl:h-[calc(100vh-170px)]">
            <div className="flex min-h-0 w-full flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-calisto-line bg-calisto-surface px-5 py-4">
                <h3 className="text-base font-extrabold text-calisto-ink">Recent Transcript</h3>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-calisto-soft">
                  {transcript.length} messages
                </span>
              </div>

              {transcript.length === 0 ? (
                <div className="flex-1 bg-calisto-table p-6 text-sm italic text-calisto-soft">No transcript available yet.</div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-calisto-table/90 p-5">
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
