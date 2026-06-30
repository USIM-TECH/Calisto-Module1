import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Mail, MapPin, Paperclip, Pencil, Phone, Plus, Send, Smile, X } from 'lucide-react'
import { getLeadDetail } from '../api/client'
import PageContainer from '../components/PageContainer'
import { SkeletonLeadDetail } from '../components/Skeleton'
import { cardImageUrl } from '../lib/chat'
import type { ConversationMessageRecord, ConversationRecord, LeadDetailResponse } from '../types'

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

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function customerName(detail: LeadDetailResponse | null) {
  if (!detail) return 'Customer detail'
  const { customer, identities } = detail
  return customer.leadName ?? identities.find((identity) => identity.senderName)?.senderName ?? customer.email ?? customer.phone ?? 'Unknown'
}

function customerInitials(detail: LeadDetailResponse | null) {
  return customerName(detail)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function statusTone(status: string) {
  if (status === 'qualified' || status === 'synced') return 'bg-calisto-accent/10 text-calisto-accent'
  if (status === 'failed' || status === 'unqualified') return 'bg-calisto-table text-calisto-body'
  if (status === 'needs_review') return 'bg-calisto-accent/10 text-calisto-accent'
  return 'bg-calisto-table text-calisto-body'
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
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

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.051 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.889-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.887 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

function richTypeLabel(messageType: string) {
  switch (messageType) {
    case 'card': return 'Product card'
    case 'image': return 'Image'
    case 'choice': return 'Quick replies'
    case 'location': return 'Location'
    default: return messageType
  }
}

function MessageBody({ message }: { message: ConversationMessageRecord }) {
  const payload = message.metadata?.payload

  if (payload?.type === 'card') {
    return (
      <div className="overflow-hidden rounded-xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-sm">
        {payload.imageUrl && (
          <img alt={payload.title} className="max-h-48 w-full object-cover" src={cardImageUrl(payload.imageUrl)} />
        )}
        <div className="p-3">
          <div className="text-sm font-extrabold">{payload.title}</div>
          {payload.subtitle && (
            <div className="mt-1 whitespace-pre-line text-xs font-medium leading-5 text-calisto-body">{payload.subtitle}</div>
          )}
          {payload.actions && payload.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {payload.actions.map((action) => (
                <span
                  className="inline-flex rounded-full border border-calisto-line bg-calisto-table px-3 py-1.5 text-[11px] font-bold text-calisto-body"
                  key={action.value}
                >
                  {action.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (payload?.type === 'image') {
    return (
      <div className="grid gap-2">
        <img
          alt={payload.caption ?? 'Image'}
          className="max-h-56 w-full rounded-xl border border-calisto-line object-cover"
          src={cardImageUrl(payload.imageUrl)}
        />
        {payload.caption && <div className="text-xs font-medium text-calisto-body">{payload.caption}</div>}
      </div>
    )
  }

  if (payload?.type === 'choice') {
    return (
      <div className="rounded-xl bg-calisto-surface px-4 py-3 text-calisto-ink shadow-sm">
        {payload.text && <div className="whitespace-pre-wrap text-[0.86rem] font-medium leading-6">{payload.text}</div>}
        <div className="mt-2 flex flex-wrap gap-2">
          {payload.options.map((option) => (
            <span
              className="inline-flex rounded-full border border-calisto-line bg-calisto-table px-3 py-1.5 text-[11px] font-bold text-calisto-body"
              key={option.value}
            >
              {option.label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (message.text) {
    return <span>{message.text}</span>
  }

  // Legacy messages stored before rich payloads were captured.
  return <span className="italic opacity-80">{richTypeLabel(message.messageType)}</span>
}

function renderChatMessage(message: ConversationMessageRecord) {
  const isOutbound = message.direction === 'outbound'
  const payload = message.metadata?.payload
  const isRich = Boolean(payload) && payload?.type !== 'text'

  if (isRich) {
    return (
      <div key={message.messageId} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
        <div className="w-full max-w-[20rem]">
          <MessageBody message={message} />
        </div>
        <div className="mt-1.5 px-1 text-[10px] font-semibold text-calisto-muted">
          {formatTime(message.timestamp)}
        </div>
      </div>
    )
  }

  const bubbleClass = isOutbound
    ? 'ml-auto rounded-br-md bg-calisto-surface text-calisto-ink shadow-sm'
    : 'mr-auto rounded-bl-md bg-calisto-sidebar text-calisto-surface shadow-sm'

  return (
    <div key={message.messageId} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[78%] whitespace-pre-wrap rounded-xl px-4 py-3 text-[0.86rem] font-medium leading-6 ${bubbleClass}`}>
        <MessageBody message={message} />
      </div>
      <div className="mt-1.5 px-1 text-[10px] font-semibold text-calisto-muted">
        {formatTime(message.timestamp)}
      </div>
    </div>
  )
}

export default function LeadDetailPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const [data, setData] = useState<LeadDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [extraTags, setExtraTags] = useState<string[]>([])
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [isEditingLead, setIsEditingLead] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [leadDraft, setLeadDraft] = useState({
    email: '',
    leadName: '',
    location: '',
    phone: '',
  })

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

  useEffect(() => {
    setExtraTags([])
    setIsAddingTag(false)
    setNewTag('')
    setIsEditingLead(false)
    setActiveConversationId(null)
  }, [customerId])

  const conversations = useMemo<ConversationRecord[]>(() => {
    if (!data) return []
    if (data.conversations?.length) {
      return data.conversations
    }
    // Backward-compat: older payloads only return a flat transcript.
    if (data.transcript?.length) {
      const channel = data.identities[0]?.channel ?? data.transcript[0]?.metadata?.channel ?? 'website'
      return [{
        id: 'legacy',
        customerId: data.customer.id,
        channelIdentityId: data.identities[0]?.id ?? '',
        channel,
        sourceId: data.identities[0]?.sourceId ?? '',
        createdAt: data.transcript[0]?.timestamp ?? new Date().toISOString(),
        updatedAt: data.transcript[data.transcript.length - 1]?.timestamp ?? new Date().toISOString(),
        messages: data.transcript,
      }]
    }
    return []
  }, [data])

  const activeConversation = useMemo(() => {
    if (!conversations.length) return undefined
    return conversations.find((conv) => conv.id === activeConversationId) ?? conversations[0]
  }, [conversations, activeConversationId])

  const tags = useMemo(() => {
    if (!data) return []
    return Array.from(new Set([
      data.customer.preferredService,
      data.customer.lastIntent,
      ...data.interests.map((interest) => interest.value),
      ...extraTags,
    ].filter(Boolean))).slice(0, 10)
  }, [data, extraTags])

  const notes = useMemo(() => {
    if (!data) return []
    return data.transcript
      .filter((message) => message.text)
      .slice(-3)
      .reverse()
  }, [data])

  if (loading) {
    return (
      <PageContainer>
        <SkeletonLeadDetail />
      </PageContainer>
    )
  }

  if (loadError) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-5 text-sm font-medium text-calisto-body shadow-sm">
          {loadError}
        </div>
      </PageContainer>
    )
  }

  if (!data) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-8 text-sm font-medium text-calisto-muted shadow-sm">
          Customer not found.
        </div>
      </PageContainer>
    )
  }

  const { customer, identities } = data
  const primaryIdentity = identities[0]
  const activeMessages = activeConversation?.messages ?? []
  const activeChannel = activeConversation?.channel ?? primaryIdentity?.channel
  const titleChannel = activeChannel ? channelLabel(activeChannel) : 'Lead'

  function openLeadEdit() {
    setLeadDraft({
      email: customer.email ?? '',
      leadName: customer.leadName ?? customerName(data),
      location: customer.location ?? '',
      phone: customer.phone ?? '',
    })
    setIsEditingLead(true)
  }

  function saveLeadEdit() {
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        customer: {
          ...current.customer,
          email: leadDraft.email.trim() || undefined,
          leadName: leadDraft.leadName.trim() || undefined,
          location: leadDraft.location.trim() || undefined,
          phone: leadDraft.phone.trim() || undefined,
        },
      }
    })
    setIsEditingLead(false)
  }

  function saveTag() {
    const value = newTag.trim()
    if (!value) {
      setIsAddingTag(false)
      setNewTag('')
      return
    }

    setExtraTags((current) => (
      current.some((tag) => tag.toLowerCase() === value.toLowerCase()) ? current : [...current, value]
    ))
    setNewTag('')
    setIsAddingTag(false)
  }

  return (
    <PageContainer>
      <div className="grid h-auto min-h-0 gap-5 xl:h-[calc(100dvh-6rem)] xl:min-h-[620px] xl:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="grid min-h-0 auto-rows-max content-start gap-4 overflow-visible pb-4 pr-1 xl:h-full xl:max-h-full xl:overflow-y-auto xl:overscroll-contain xl:pb-8">
          <section className="overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
            <div className="flex items-start gap-4 border-b border-calisto-line-subtle px-5 py-5">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-calisto-accent text-sm font-extrabold text-calisto-surface">
                {customerInitials(data)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="truncate text-xl font-semibold text-calisto-ink">{customerName(data)}</h1>
                  <button
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-calisto-accent transition hover:bg-calisto-accent/10"
                    onClick={openLeadEdit}
                    title="Edit lead"
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusTone(customer.qualificationStatus)}`}>
                  {statusLabel(customer.qualificationStatus)}
                </span>
              </div>
            </div>

            <div className="border-b border-calisto-line-subtle px-5 py-5">
              <div className="mb-4 text-[11px] font-extrabold uppercase tracking-wider text-calisto-ink">Contact Info</div>
              <div className="grid gap-3 text-sm font-medium text-calisto-body">
                <div className="flex min-w-0 items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-calisto-accent" />
                  <span className="truncate">{customer.email ?? 'Email not provided'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-calisto-accent" />
                  <span className="truncate">{customer.phone ?? primaryIdentity?.sourceId ?? 'Phone not provided'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <MapPin className="h-4 w-4 shrink-0 text-calisto-accent" />
                  <span className="truncate">{customer.location ?? 'Location not provided'}</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="mb-4 text-[11px] font-extrabold uppercase tracking-wider text-calisto-ink">Tags</div>
              <div className="flex flex-wrap gap-2">
                {tags.length > 0 ? tags.map((tag) => (
                  <span
                    className="inline-flex max-w-full items-center rounded-md border border-calisto-line bg-calisto-table px-2.5 py-1 text-[10px] font-extrabold text-calisto-body"
                    key={tag}
                  >
                    <span className="truncate">{tag}</span>
                  </span>
                )) : (
                  <span className="text-xs font-semibold text-calisto-soft">No tags captured</span>
                )}
                {isAddingTag ? (
                  <form
                    className="flex max-w-full items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault()
                      saveTag()
                    }}
                  >
                    <input
                      autoFocus
                      className="h-7 w-28 rounded-md border border-calisto-line bg-calisto-surface px-2 text-[11px] font-semibold text-calisto-body outline-none placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-2 focus:ring-calisto-focus"
                      onChange={(event) => setNewTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setIsAddingTag(false)
                          setNewTag('')
                        }
                      }}
                      placeholder="New tag"
                      value={newTag}
                    />
                    <button className="inline-flex h-7 items-center rounded-md bg-calisto-sidebar px-2 text-[10px] font-extrabold text-calisto-surface transition hover:bg-calisto-sidebarActive" type="submit">
                      Add
                    </button>
                  </form>
                ) : (
                  <button className="inline-flex items-center gap-1 rounded-md border border-calisto-line bg-calisto-surface px-2.5 py-1 text-[10px] font-extrabold text-calisto-body transition hover:bg-calisto-surface-muted" onClick={() => setIsAddingTag(true)} type="button">
                    <Plus className="h-3 w-3" />
                    Add Tag
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
            <div className="border-b border-calisto-line-subtle px-5 py-4 text-[11px] font-extrabold uppercase tracking-wider text-calisto-ink">
              Quick Notes
            </div>
            <div className="px-5 py-4">
              <textarea
                className="min-h-32 w-full resize-none rounded-md border border-transparent bg-calisto-table p-3 text-sm font-medium leading-6 text-calisto-body outline-none placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                placeholder="Jot down your notes..."
              />
            </div>
            <div className="border-t border-calisto-line-subtle px-5 py-4">
              <div className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-calisto-ink">Notes</div>
              <div className="grid gap-3">
                {notes.length > 0 ? notes.map((message) => (
                  <div className="rounded-lg border border-calisto-line-subtle bg-calisto-surface-muted px-3 py-2 text-[11px] font-medium leading-5 text-calisto-body" key={message.messageId}>
                    {message.text}
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-calisto-line bg-calisto-table px-3 py-3 text-xs font-medium text-calisto-muted">
                    No notes yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-calisto-line-subtle px-5">
            <div className="flex min-w-0 items-center gap-2">
              {activeChannel === 'whatsapp' && <WhatsAppIcon className="h-4 w-4 shrink-0 text-calisto-accent" />}
              <h2 className="truncate text-sm font-extrabold uppercase tracking-wider text-calisto-ink">
                {titleChannel} Chat with {customerName(data).split(/\s+/)[0] ?? customerName(data)}
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-calisto-accent">
              <span className="h-2 w-2 rounded-full bg-calisto-accent" />
              Online
            </span>
          </div>

          {conversations.length > 1 && (
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-calisto-line-subtle px-5 py-2.5">
              {conversations.map((conv) => {
                const isActive = conv.id === (activeConversation?.id ?? '')
                return (
                  <button
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition ${
                      isActive
                        ? 'bg-calisto-sidebar text-calisto-surface'
                        : 'border border-calisto-line bg-calisto-surface text-calisto-body hover:bg-calisto-surface-muted'
                    }`}
                    key={conv.id}
                    onClick={() => setActiveConversationId(conv.id)}
                    type="button"
                  >
                    {conv.channel === 'whatsapp' && <WhatsAppIcon className="h-3.5 w-3.5" />}
                    {channelLabel(conv.channel)}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto overscroll-contain bg-calisto-table/80 px-12 py-7">
            {activeMessages.length > 0 && (
              <div className="self-center rounded-full bg-calisto-surface px-3 py-1 text-[10px] font-bold text-calisto-soft shadow-sm">
                {formatDate(activeMessages[0].timestamp)}
              </div>
            )}
            {activeMessages.length === 0 ? (
              <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-calisto-line bg-calisto-surface text-sm font-medium text-calisto-muted">
                No transcript available yet.
              </div>
            ) : (
              activeMessages.map((message) => renderChatMessage(message))
            )}
          </div>

          <div className="shrink-0 border-t border-calisto-line-subtle bg-calisto-surface px-5 py-4">
            <div className="flex items-center gap-3 rounded-xl bg-calisto-table px-3 py-2">
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-calisto-body transition hover:bg-calisto-surface" type="button">
                <Paperclip className="h-4 w-4" />
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-calisto-body transition hover:bg-calisto-surface" type="button">
                <Smile className="h-4 w-4" />
              </button>
              <input
                className="h-9 min-w-0 flex-1 bg-transparent text-sm font-medium text-calisto-body outline-none placeholder:text-calisto-soft"
                placeholder={`Type a message to ${customerName(data).split(/\s+/)[0] ?? 'this lead'}... Use / for templates.`}
                type="text"
              />
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-calisto-sidebar text-calisto-surface transition hover:bg-calisto-sidebarActive" type="button">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold text-calisto-muted">
              <span>End-to-end encrypted channel</span>
              <span>Press Enter to send</span>
            </div>
          </div>
        </section>
      </div>

      {isEditingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
          <div
            aria-labelledby="editLeadTitle"
            aria-modal="true"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-calisto-line px-6 py-5">
              <div>
                <h2 id="editLeadTitle" className="text-lg font-bold text-calisto-ink">Edit lead</h2>
                <p className="mt-1 text-sm text-calisto-body">Updates apply to this review view.</p>
              </div>
              <button
                aria-label="Close edit lead"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface text-calisto-ink transition hover:bg-calisto-surface-muted"
                onClick={() => setIsEditingLead(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 px-6 py-5">
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Name</span>
                <input
                  className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  onChange={(event) => setLeadDraft((draft) => ({ ...draft, leadName: event.target.value }))}
                  value={leadDraft.leadName}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Email</span>
                <input
                  className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  onChange={(event) => setLeadDraft((draft) => ({ ...draft, email: event.target.value }))}
                  type="email"
                  value={leadDraft.email}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Phone</span>
                <input
                  className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  onChange={(event) => setLeadDraft((draft) => ({ ...draft, phone: event.target.value }))}
                  value={leadDraft.phone}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Location</span>
                <input
                  className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  onChange={(event) => setLeadDraft((draft) => ({ ...draft, location: event.target.value }))}
                  value={leadDraft.location}
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-calisto-line px-6 py-5">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface px-4 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted"
                onClick={() => setIsEditingLead(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-calisto-accent bg-calisto-accent px-4 text-sm font-semibold text-calisto-surface shadow-sm transition hover:bg-calisto-accent/90"
                onClick={saveLeadEdit}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
