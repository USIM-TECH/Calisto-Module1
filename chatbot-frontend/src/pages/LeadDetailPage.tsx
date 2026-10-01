import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Mail, MapPin, MessageSquareText, Pencil, Phone, Plus, Sparkles, Target } from 'lucide-react'
import { getLeadDetail } from '../api/client'
import { ChannelIcon, WhatsAppIcon } from '../components/ChannelIcon'
import Modal from '../components/Modal'
import PageContainer from '../components/PageContainer'
import { useSnackbar } from '../components/Snackbar'
import { SkeletonLeadDetail } from '../components/Skeleton'
import { cardImageUrl } from '../lib/chat'
import { formatIntent } from '../lib/format'
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

/** Compact date for the Details card, e.g. "29 Sep, 10:48 am" (year only if not this year). */
function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
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

/**
 * Returns to the Leads list. Coming from it, go back in history so its search,
 * filters and page (kept in the URL) are restored; otherwise open /leads.
 */
function BackToLeads({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromLeads = Boolean((location.state as { fromLeads?: boolean } | null)?.fromLeads)
  const goBack = () => (fromLeads ? navigate(-1) : navigate('/leads'))

  if (compact) {
    return (
      <button
        aria-label="Back to leads"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-calisto-line text-calisto-body transition hover:bg-calisto-surface-muted hover:text-calisto-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40"
        onClick={goBack}
        title="Back to leads"
        type="button"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
      </button>
    )
  }

  return (
    <button
      className="mb-4 inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-sm font-semibold text-calisto-body transition hover:text-calisto-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40"
      onClick={goBack}
      type="button"
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
      Back to leads
    </button>
  )
}

/** Highlighted fact at the top of the card (tinted tile with an icon). */
function HighlightTile({ icon, label, value }: { icon: ReactNode; label: string; value?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-calisto-accent/[0.06] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-calisto-accent">
        {icon}
        {label}
      </div>
      <div className={`mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 ${value ? 'text-calisto-ink' : 'text-calisto-soft'}`} title={value}>
        {value ?? 'Not yet known'}
      </div>
    </div>
  )
}

/** Contact line: icon in a soft square, clickable value, copy button on hover. */
function ContactRow({
  icon,
  label,
  value,
  href,
  external = false,
}: {
  icon: ReactNode
  label: string
  value?: string
  href?: string
  external?: boolean
}) {
  const snackbar = useSnackbar()

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      snackbar.success(`${label} copied.`)
    } catch {
      snackbar.error('Could not copy. Select the text and copy it manually.')
    }
  }

  return (
    <div className="group flex min-w-0 items-center gap-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-calisto-table text-calisto-body">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-calisto-muted">{label}</div>
        {value ? (
          href ? (
            <a
              className="block truncate text-sm text-calisto-ink transition hover:text-calisto-accent"
              href={href}
              rel={external ? 'noreferrer' : undefined}
              target={external ? '_blank' : undefined}
              title={value}
            >
              {value}
            </a>
          ) : (
            <div className="truncate text-sm text-calisto-ink" title={value}>{value}</div>
          )
        ) : (
          <div className="text-sm text-calisto-soft">Not provided</div>
        )}
      </div>
      {value && (
        <button
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-calisto-muted opacity-0 transition hover:bg-calisto-table hover:text-calisto-ink focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => void copy()}
          title="Copy"
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** "just now", "5m ago", "2h ago", "3d ago", else a short date. */
function timeAgo(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

const CRM_TONE: Record<string, string> = {
  synced: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
}

function whatsappLink(phone?: string) {
  const digits = phone?.replace(/[^\d]/g, '')
  return digits ? `https://wa.me/${digits}` : undefined
}

// Internal notes are kept in this browser per lead (there is no notes API yet).
const noteKey = (customerId: string) => `calisto-lead-note:${customerId}`

function loadNote(customerId: string): string {
  try {
    return window.localStorage.getItem(noteKey(customerId)) ?? ''
  } catch {
    return ''
  }
}

function saveNote(customerId: string, value: string) {
  try {
    if (value.trim()) window.localStorage.setItem(noteKey(customerId), value)
    else window.localStorage.removeItem(noteKey(customerId))
  } catch {
    // Storage blocked: the note just won't persist.
  }
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

function richTypeLabel(messageType: string) {
  switch (messageType) {
    case 'card': return 'Product card'
    case 'image': return 'Image'
    case 'choice': return 'Quick replies'
    case 'location': return 'Location'
    default: return messageType
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

// Button clicks are stored as raw Rasa payloads, e.g.
// `/select_brand{"brand":"Bossini"}` or `/browse_eyewear`. Render the human
// label a person would have tapped instead of the raw payload string.
function humanizeMessageText(text: string): string {
  const match = /^\/([a-z0-9_]+)(\{.*\})?$/i.exec(text.trim())
  if (!match) return text

  const [, intent, jsonPart] = match
  if (jsonPart) {
    try {
      const entities = JSON.parse(jsonPart) as Record<string, unknown>
      const values = Object.values(entities).filter(
        (value): value is string => typeof value === 'string' && value.trim() !== '',
      )
      if (values.length > 0) return values.join(', ')
    } catch {
      // Fall back to the prettified intent name below.
    }
  }
  return titleCase(intent)
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
    return <span>{humanizeMessageText(message.text)}</span>
  }

  // Legacy messages stored before rich payloads were captured.
  return <span className="italic opacity-80">{richTypeLabel(message.messageType)}</span>
}

/**
 * One chat message. Consecutive messages from the same side form a group (like
 * WhatsApp): tight spacing inside a group, a larger gap when the speaker changes,
 * and the time shown once under the last message of the group.
 */
function renderChatMessage(message: ConversationMessageRecord, previous?: ConversationMessageRecord, next?: ConversationMessageRecord) {
  const isOutbound = message.direction === 'outbound'
  const payload = message.metadata?.payload
  const isRich = Boolean(payload) && payload?.type !== 'text'
  const startsGroup = previous?.direction !== message.direction
  const endsGroup = next?.direction !== message.direction

  const bubbleClass = isOutbound
    ? 'rounded-br-md bg-calisto-surface text-calisto-ink shadow-sm'
    : 'rounded-bl-md bg-calisto-sidebar text-calisto-surface shadow-sm'

  return (
    <div
      key={message.messageId}
      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${previous ? (startsGroup ? 'mt-5' : 'mt-1.5') : ''}`}
    >
      {isRich ? (
        <div className="w-full max-w-[20rem]">
          <MessageBody message={message} />
        </div>
      ) : (
        <div className={`max-w-[78%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-[0.86rem] font-medium leading-6 ${bubbleClass}`}>
          <MessageBody message={message} />
        </div>
      )}
      {endsGroup && (
        <div className="mt-1 px-1 text-[10px] font-semibold text-calisto-muted">
          {formatTime(message.timestamp)}
        </div>
      )}
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
  const [note, setNote] = useState(() => (customerId ? loadNote(customerId) : ''))
  const transcriptRef = useRef<HTMLDivElement | null>(null)
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
    setNote(customerId ? loadNote(customerId) : '')
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
      data.customer.preferredService && formatIntent(data.customer.preferredService),
      data.customer.lastIntent && formatIntent(data.customer.lastIntent),
      ...data.interests.map((interest) => interest.value),
      ...extraTags,
    ].filter(Boolean))).slice(0, 10)
  }, [data, extraTags])

  // Open each conversation at its most recent message, like a chat app.
  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript) transcript.scrollTop = transcript.scrollHeight
  }, [activeConversation?.id, data])

  if (loading) {
    return (
      <PageContainer>
        <BackToLeads />
        <SkeletonLeadDetail />
      </PageContainer>
    )
  }

  if (loadError) {
    return (
      <PageContainer>
        <BackToLeads />
        <div className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-5 text-sm font-medium text-calisto-body shadow-sm">
          {loadError}
        </div>
      </PageContainer>
    )
  }

  if (!data) {
    return (
      <PageContainer>
        <BackToLeads />
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

  const firstName = customerName(data).split(/\s+/)[0] ?? customerName(data)
  const waLink = whatsappLink(customer.phone)
  const activeIdentity = identities.find((identity) => identity.id === activeConversation?.channelIdentityId)
  const phoneDisplay = customer.phone ?? (primaryIdentity && primaryIdentity.channel !== 'website' ? primaryIdentity.sourceId : undefined)
  const crmStatus = data.crm?.status ?? customer.crmStatus
  const iconButton =
    'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface transition hover:bg-calisto-surface-muted'
  const secondaryButton =
    'inline-flex h-9 items-center gap-2 rounded-xl border border-calisto-line bg-calisto-surface px-3.5 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted'

  return (
    // Desktop: fills the screen. Header card on top; Details (left) and the
    // conversation (right) below. Only the chat transcript scrolls.
    <PageContainer className="xl:flex xl:h-[100dvh] xl:flex-col">
      <section className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-2xl border border-calisto-line-subtle bg-calisto-surface px-5 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <BackToLeads compact />
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-calisto-accent text-sm font-extrabold text-calisto-surface">
            {customerInitials(data)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-calisto-ink">{customerName(data)}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${statusTone(customer.qualificationStatus)}`}>
                {statusLabel(customer.qualificationStatus)}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${CRM_TONE[crmStatus] ?? CRM_TONE.pending}`}>
                CRM · {statusLabel(crmStatus)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-calisto-muted">
              {identities.map((identity) => (
                <span className="inline-flex items-center gap-1.5" key={identity.id}>
                  <ChannelIcon channel={identity.channel} className="h-3.5 w-3.5" />
                  {channelLabel(identity.channel)}
                  {identity.accountLabel ? ` · ${identity.accountLabel}` : ''}
                </span>
              ))}
              {identities.length > 0 && <span aria-hidden="true" className="text-calisto-line">|</span>}
              <span title={formatDate(customer.lastMessageAt)}>Active {timeAgo(customer.lastMessageAt)}</span>
              <span aria-hidden="true">·</span>
              <span title={formatDate(customer.firstSeenAt)}>
                First seen {new Date(customer.firstSeenAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waLink && (
            <a aria-label="Chat on WhatsApp" className={iconButton} href={waLink} rel="noreferrer" target="_blank" title="Chat on WhatsApp">
              <WhatsAppIcon className="h-4 w-4 text-emerald-600" />
            </a>
          )}
          {customer.email && (
            <a aria-label="Send email" className={iconButton} href={`mailto:${customer.email}`} title="Send email">
              <Mail className="h-4 w-4 text-blue-700" />
            </a>
          )}
          <button className={secondaryButton} onClick={openLeadEdit} title="Edit lead" type="button">
            <Pencil className="h-4 w-4 text-calisto-accent" />
            Edit
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
          <section className="grid grid-cols-2 gap-2 border-b border-calisto-line-subtle p-4">
            <HighlightTile
              icon={<Target className="h-3.5 w-3.5" />}
              label="Interested in"
              value={customer.preferredService ? formatIntent(customer.preferredService) : undefined}
            />
            <HighlightTile
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Last intent"
              value={customer.lastIntent ? formatIntent(customer.lastIntent) : undefined}
            />
          </section>

          <section className="border-b border-calisto-line-subtle px-5 py-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-calisto-ink">Contact</h2>
            <div className="grid gap-3">
              <ContactRow
                href={customer.email ? `mailto:${customer.email}` : undefined}
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={customer.email}
              />
              <ContactRow
                external
                href={whatsappLink(phoneDisplay)}
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={phoneDisplay}
              />
              <ContactRow icon={<MapPin className="h-4 w-4" />} label="Location" value={customer.location} />
            </div>
          </section>

          <section className="border-b border-calisto-line-subtle px-5 py-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-calisto-ink">Tags</h2>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  className="inline-flex max-w-full items-center rounded-full border border-calisto-line bg-calisto-surface px-2.5 py-1 text-xs font-medium text-calisto-ink"
                  key={tag}
                >
                  <span className="truncate">{tag}</span>
                </span>
              ))}
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
                    className="h-7 w-28 rounded-full border border-calisto-line bg-calisto-surface px-3 text-xs text-calisto-body outline-none placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-2 focus:ring-calisto-focus"
                    onBlur={saveTag}
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
                </form>
              ) : (
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-calisto-line px-2.5 py-1 text-xs font-medium text-calisto-muted transition hover:border-calisto-accent/40 hover:text-calisto-accent"
                  onClick={() => setIsAddingTag(true)}
                  type="button"
                >
                  <Plus className="h-3 w-3" />
                  Add tag
                </button>
              )}
            </div>
          </section>

          {/* Notes take whatever height is left, so the card always matches the conversation card. */}
          <section className="flex min-h-0 flex-1 flex-col px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-calisto-ink">Notes</h2>
              <span className="text-[11px] text-calisto-soft">Saved on this device</span>
            </div>
            <textarea
              aria-label="Notes about this lead"
              className="min-h-[4.5rem] w-full flex-1 resize-none rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm leading-6 text-calisto-ink outline-none placeholder:text-amber-700/40 focus:border-amber-200 focus:ring-4 focus:ring-amber-100"
              onChange={(event) => {
                setNote(event.target.value)
                if (customerId) saveNote(customerId, event.target.value)
              }}
              placeholder={`Add a note about ${firstName}…`}
              value={note}
            />
          </section>
        </aside>

        <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm xl:min-h-0">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-calisto-line-subtle px-5 py-3">
            {conversations.length > 1 ? (
              <div aria-label="Conversations" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-calisto-table p-1" role="tablist">
                {conversations.map((conv) => {
                  const isActive = conv.id === (activeConversation?.id ?? '')
                  const identity = identities.find((entry) => entry.id === conv.channelIdentityId)
                  return (
                    <button
                      aria-selected={isActive}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        isActive ? 'bg-calisto-surface text-calisto-ink shadow-sm' : 'text-calisto-body hover:text-calisto-ink'
                      }`}
                      key={conv.id}
                      onClick={() => setActiveConversationId(conv.id)}
                      role="tab"
                      type="button"
                    >
                      <ChannelIcon channel={conv.channel} className="h-4 w-4" />
                      {channelLabel(conv.channel)}
                      {identity?.accountLabel ? <span className="text-calisto-muted">· {identity.accountLabel}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-calisto-ink">
                {activeChannel ? <ChannelIcon channel={activeChannel} className="h-4 w-4 shrink-0" /> : <MessageSquareText className="h-4 w-4" />}
                <span className="truncate">
                  {titleChannel} conversation
                  {activeIdentity?.accountLabel ? <span className="font-normal text-calisto-muted"> · {activeIdentity.accountLabel}</span> : null}
                </span>
              </h2>
            )}
            {activeConversation && activeMessages.length > 0 && (
              <span className="shrink-0 text-xs text-calisto-muted">
                {activeMessages.length} message{activeMessages.length === 1 ? '' : 's'} · Started {formatShortDate(activeConversation.createdAt)}
              </span>
            )}
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-calisto-table/80 px-5 py-6 lg:px-8" ref={transcriptRef}>
            {activeMessages.length > 0 && (
              <div className="mb-5 self-center rounded-full bg-calisto-surface px-3 py-1 text-[10px] font-bold text-calisto-soft shadow-sm">
                {formatDate(activeMessages[0].timestamp)}
              </div>
            )}
            {activeMessages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-calisto-muted">
                <MessageSquareText className="h-8 w-8 text-calisto-soft" strokeWidth={1.5} />
                No messages in this conversation yet.
              </div>
            ) : (
              activeMessages.map((message, index) =>
                renderChatMessage(message, activeMessages[index - 1], activeMessages[index + 1]),
              )
            )}
          </div>

        </section>
      </div>

      {isEditingLead && (
        <Modal
          description="Updates apply to this review view."
          footer={(
            <>
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
            </>
          )}
          onClose={() => setIsEditingLead(false)}
          size="sm"
          title="Edit lead"
        >
          <div className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Name</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                onChange={(event) => setLeadDraft((draft) => ({ ...draft, leadName: event.target.value }))}
                value={leadDraft.leadName}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Email</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                onChange={(event) => setLeadDraft((draft) => ({ ...draft, email: event.target.value }))}
                type="email"
                value={leadDraft.email}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Phone</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                onChange={(event) => setLeadDraft((draft) => ({ ...draft, phone: event.target.value }))}
                value={leadDraft.phone}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[0.68rem] font-bold uppercase tracking-wider text-calisto-ink">Location</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-3 text-sm font-medium text-calisto-body outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                onChange={(event) => setLeadDraft((draft) => ({ ...draft, location: event.target.value }))}
                value={leadDraft.location}
              />
            </label>
          </div>
        </Modal>
      )}
    </PageContainer>
  )
}
