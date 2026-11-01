import { useEffect, useRef, useState } from 'react'
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Send, SquarePen, X } from 'lucide-react'
import { generateConversationTitle, postWebchatMessage } from '../api/client'
import ChatMessageBubble from '../components/ChatMessageBubble'
import GuidedShoppingPanel, { type GuidedStep } from '../components/GuidedShoppingPanel'
import calistoLogo from '../../calisto.svg'
import {
  getOrCreateSenderId,
  messagePreview,
  persistSenderId,
  resetSenderId,
} from '../lib/chat'
import {
  conversationTitle,
  loadConversations,
  loadSidebarCollapsed,
  saveConversations,
  saveSidebarCollapsed,
  SMALL_TALK,
  type StoredConversation,
} from '../lib/chat-history'
import { guidedCategories, type BudgetOption, type GuidedCategory } from '../lib/guided-shopping'
import type { OutgoingMessage, WebchatRequest, WebchatResponse } from '../types'

interface ConsoleMessage {
  content: string
  direction: 'customer' | 'assistant'
  id: string
  payload?: OutgoingMessage
  timestamp: string
}

// `display` is what appears in the chat as the user's message; defaults to `label`.
const promptOptions: Array<{ label: string; value: string; display?: string }> = [
  { label: 'Start conversation', value: 'hi', display: 'Hi' },
  { label: 'Browse eyewear', value: '/browse_eyewear' },
  { label: 'Find a store', value: '/find_a_store' },
  { label: 'Book appointment', value: 'I want to book an eye test appointment' },
]

function currentStamp() {
  return new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
}

const WEBCHAT_SCOPE = 'website-chatbot'

// The AI title is requested once the customer has asked something real and got an answer.
function readyForAiTitle(messages: ConsoleMessage[]): boolean {
  const topicIndex = messages.findIndex((entry) => entry.direction === 'customer' && !SMALL_TALK.test(entry.content.trim()))
  return topicIndex >= 0 && messages.slice(topicIndex + 1).some((entry) => entry.direction === 'assistant')
}

export default function ChatbotPage() {
  const [senderId, setSenderId] = useState(() => getOrCreateSenderId(WEBCHAT_SCOPE))
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'Ready' | 'Sending' | 'Failed'>('Ready')
  const [conversations, setConversations] = useState<StoredConversation<ConsoleMessage>[]>(() => loadConversations<ConsoleMessage>())
  // Empty until the first message: the centred greeting screen shows instead.
  // After a refresh, the open conversation is restored from the sidebar history.
  const [messages, setMessages] = useState<ConsoleMessage[]>(
    () => conversations.find((conversation) => conversation.id === senderId)?.messages ?? [],
  )
  const [historyQuery, setHistoryQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guidedStep, setGuidedStep] = useState<GuidedStep>(() => messages.length === 0 ? 'welcome' : 'closed')
  const [guidedCategory, setGuidedCategory] = useState<GuidedCategory | undefined>()
  const [guidedBudget, setGuidedBudget] = useState<BudgetOption | undefined>()
  const [guidedBrand, setGuidedBrand] = useState<string | undefined>()
  const [guidedInStock, setGuidedInStock] = useState<boolean | undefined>()
  const [guidedBrands, setGuidedBrands] = useState<string[]>([])
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  const isSending = status === 'Sending'

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending])

  // Save the open conversation to the sidebar history whenever it gains messages.
  useEffect(() => {
    if (messages.length === 0) return
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === senderId)
      if (existing && existing.messages.length === messages.length) return current // just reopened
      const updated: StoredConversation<ConsoleMessage> = {
        id: senderId,
        title: existing?.aiTitle ? existing.title : conversationTitle(messages),
        aiTitle: existing?.aiTitle,
        updatedAt: Date.now(),
        messages,
      }
      const next = [updated, ...current.filter((conversation) => conversation.id !== senderId)]
      saveConversations(next)
      return next
    })
  }, [messages, senderId])

  // Ask the backend for a short AI title once, after the first real exchange.
  // On any failure the first-message title stays.
  const titleRequested = useRef(new Set<string>())
  useEffect(() => {
    if (!readyForAiTitle(messages)) return
    if (titleRequested.current.has(senderId)) return
    if (conversations.find((conversation) => conversation.id === senderId)?.aiTitle) return
    titleRequested.current.add(senderId)
    const conversationId = senderId
    const turns = messages.map((entry) => ({
      role: entry.direction === 'customer' ? ('user' as const) : ('assistant' as const),
      content: entry.content,
    }))
    generateConversationTitle(turns)
      .then((title) => {
        if (!title) return
        setConversations((current) => {
          const next = current.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, title, aiTitle: true } : conversation,
          )
          saveConversations(next)
          return next
        })
      })
      .catch(() => {})
  }, [messages, senderId, conversations])

  // Matches the title or any message text, so an old chat can be found by what was said in it.
  const trimmedQuery = historyQuery.trim().toLowerCase()
  const visibleConversations = trimmedQuery
    ? conversations.filter(
        (conversation) =>
          conversation.title.toLowerCase().includes(trimmedQuery) ||
          conversation.messages.some((entry) => entry.content.toLowerCase().includes(trimmedQuery)),
      )
    : conversations

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed)
  }, [sidebarCollapsed])

  // Shrink the auto-growing composer back to one line once the message is sent.
  useEffect(() => {
    if (!message && composerRef.current) composerRef.current.style.height = ''
  }, [message])

  async function sendMessage(text: string, displayText?: string, guidedAction?: WebchatRequest['guidedAction'], hideGuidedChoices = false): Promise<WebchatResponse | undefined> {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    const visible = (displayText ?? trimmed).trim()

    setMessages((current) => [
      ...current,
      {
        content: visible,
        direction: 'customer',
        id: `${Date.now()}-customer`,
        timestamp: currentStamp(),
      },
    ])
    setMessage('')
    setStatus('Sending')
    setError(null)

    try {
      const response: WebchatResponse = await postWebchatMessage({ senderId, message: trimmed, guidedAction })
      persistSenderId(response.senderId, WEBCHAT_SCOPE)
      setSenderId(response.senderId)

      const replies = response.messages.length
        ? response.messages
        : [{ type: 'text' as const, text: 'No reply from the assistant.' }]

      setMessages((current) => [
        ...current,
        ...replies.filter((reply) => !(hideGuidedChoices && reply.type === 'choice')).map((reply, index) => ({
          content: messagePreview(reply),
          direction: 'assistant' as const,
          id: `${Date.now()}-assistant-${index}`,
          payload: reply,
          timestamp: currentStamp(),
        })),
      ])
      setStatus('Ready')
      return response
    } catch (caught) {
      setStatus('Failed')
      setError(caught instanceof Error ? caught.message : 'Message failed.')
      return undefined
    }
  }

  function eventId() { return `web-${Date.now()}-${Math.random().toString(36).slice(2)}` }

  function resetGuidedFlow() {
    setGuidedStep('welcome')
    setGuidedCategory(undefined)
    setGuidedBudget(undefined)
    setGuidedBrand(undefined)
    setGuidedInStock(undefined)
    setGuidedBrands([])
    void sendMessage('Start over', 'Start over', { action: 'reset', eventId: eventId() }, true)
  }

  function beginGuidedCategory(category: GuidedCategory) {
    setGuidedCategory(category)
    setGuidedBudget(undefined)
    setGuidedBrand(undefined)
    setGuidedInStock(undefined)
    setGuidedBrands([])
    setGuidedStep('budget')
    void sendMessage(category.label, category.label, { action: 'category', value: category.productType ?? 'any', eventId: eventId() }, true)
  }

  async function chooseGuidedBudget(budget: BudgetOption) {
    setGuidedBudget(budget)
    setGuidedStep('preferences')
    const value = budget.minimum === undefined && budget.maximum === undefined
      ? 'any'
      : budget.minimum !== undefined && budget.maximum !== undefined
        ? `range:${budget.minimum}-${budget.maximum}`
        : budget.maximum !== undefined ? `max:${budget.maximum}` : `min:${budget.minimum}`
    const response = await sendMessage(budget.label, budget.label, { action: 'budget', value, eventId: eventId() }, true)
    const choice = response?.messages.find((message) => message.type === 'choice')
    if (choice?.type === 'choice') setGuidedBrands(choice.options.filter((option) => option.value.startsWith('guided:brand:')).map((option) => option.label))
  }

  function submitGuidedSearch(options: { brand?: string; inStock?: boolean }) {
    if (!guidedCategory || !guidedBudget) return
    setGuidedBrand(options.brand)
    setGuidedInStock(options.inStock)
    setGuidedStep('closed')
    void sendMessage(
      `${guidedCategory.label} ${guidedBudget.label}`,
      [guidedCategory.label, guidedBudget.label, options.brand, options.inStock ? 'Available now' : undefined].filter(Boolean).join(' · '),
      { action: 'brand', value: options.brand ?? 'any', stockRequired: options.inStock ?? false, eventId: eventId() },
    )
  }

  function exploreProducts() {
    const category = guidedCategories.find((item) => item.kind === 'explore')
    if (!category) return
    beginGuidedCategory(category)
  }

  function handlePostback(value: string, label?: string) {
    if (!value.startsWith('guided:')) return void sendMessage(value, label)
    const [, action, ...parts] = value.split(':')
    if (action === 'reset') setGuidedStep('welcome')
    else if (action === 'back') setGuidedStep('budget')
    else if (action === 'category') setGuidedStep('budget')
    else if (action === 'budget') setGuidedStep('preferences')
    else if (action === 'brand' || action === 'showMore') setGuidedStep('closed')
    void sendMessage(label ?? value, label, { action: action as NonNullable<WebchatRequest['guidedAction']>['action'], value: parts.length ? parts.join(':') : undefined, eventId: eventId() })
  }

  function handleResetSession() {
    const nextSenderId = resetSenderId(WEBCHAT_SCOPE)
    setSenderId(nextSenderId)
    setMessages([])
    setError(null)
    setStatus('Ready')
    setGuidedStep('welcome')
    setGuidedCategory(undefined)
    setGuidedBudget(undefined)
    setGuidedBrand(undefined)
    setGuidedInStock(undefined)
    setGuidedBrands([])
    setMobileSidebarOpen(false)
  }

  // Reopen a past conversation; the same sender id keeps the bot's context.
  function openConversation(conversation: StoredConversation<ConsoleMessage>) {
    if (isSending) return
    persistSenderId(conversation.id, WEBCHAT_SCOPE)
    setSenderId(conversation.id)
    setMessages(conversation.messages)
    setError(null)
    setStatus('Ready')
    setGuidedStep('closed')
    setMobileSidebarOpen(false)
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== id)
      saveConversations(next)
      return next
    })
    if (id === senderId) handleResetSession()
  }

  const hasConversation = messages.length > 0

  // One rounded box holding the text area and the send button (shared by both screens).
  const composer = (
    <div className="rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard transition focus-within:border-calisto-accent/50 focus-within:ring-4 focus-within:ring-calisto-focus">
      <textarea
        aria-label="Message"
        className="block max-h-48 min-h-[3.25rem] w-full resize-none bg-transparent px-4 pt-4 text-base leading-6 text-calisto-ink outline-none placeholder:text-calisto-soft sm:text-sm"
        onChange={(event) => {
          setMessage(event.target.value)
          // Grow with the text up to max-h-48, then scroll inside the box.
          event.target.style.height = 'auto'
          event.target.style.height = `${event.target.scrollHeight}px`
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void sendMessage(message)
          }
        }}
        placeholder="Type your message…"
        ref={composerRef}
        rows={1}
        value={message}
      />
      <div className="flex items-center justify-end px-3 pb-3 pt-1">
        <button
          aria-label="Send message"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-calisto-accent text-calisto-surface transition hover:bg-calisto-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isSending || !message.trim()}
          onClick={() => void sendMessage(message)}
          type="button"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  const sidebar = (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-calisto-line bg-calisto-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:transition-[width]',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        sidebarCollapsed ? 'lg:w-16 lg:border-transparent lg:bg-calisto-canvas' : 'lg:w-72',
      ].join(' ')}
    >
      <div className={`flex h-14 shrink-0 items-center px-3 ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
        <img
          alt="Calisto"
          className={`ml-2 h-6 w-auto brightness-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}
          src={calistoLogo}
        />
        <button
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden h-9 w-9 items-center justify-center rounded-lg text-calisto-body transition lg:inline-flex ${
            sidebarCollapsed ? 'hover:bg-calisto-surface' : 'hover:bg-calisto-surface-muted'
          }`}
          onClick={() => setSidebarCollapsed((value) => !value)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        <button
          aria-label="Close sidebar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-calisto-body transition hover:bg-calisto-surface-muted lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3">
        <button
          aria-label="New chat"
          className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted disabled:opacity-50 ${
            sidebarCollapsed ? 'lg:justify-center lg:px-0 lg:hover:bg-calisto-surface' : ''
          }`}
          disabled={isSending}
          onClick={handleResetSession}
          title="New chat"
          type="button"
        >
          <SquarePen className="h-4 w-4 shrink-0 text-calisto-accent" />
          <span className={sidebarCollapsed ? 'lg:hidden' : ''}>New chat</span>
        </button>
      </div>

      <div className={`mt-2 px-3 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-calisto-muted" />
          <input
            aria-label="Search conversations"
            className="h-9 w-full rounded-lg border border-calisto-line bg-calisto-surface pl-9 pr-8 text-sm text-calisto-ink outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search chats"
            type="search"
            value={historyQuery}
          />
        </label>
      </div>

      <nav aria-label="Recent conversations" className={`mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-4 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
        <h2 className="px-3 pb-2 text-xs font-semibold text-calisto-muted">Recents</h2>
        {visibleConversations.length === 0 ? (
          <p className="px-3 text-sm text-calisto-soft">
            {conversations.length === 0 ? 'No conversations yet.' : 'No matching conversations.'}
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {visibleConversations.map((conversation) => {
              const active = conversation.id === senderId
              return (
                <li className="group relative" key={conversation.id}>
                  <button
                    aria-current={active ? 'true' : undefined}
                    className={`flex h-9 w-full items-center rounded-lg pl-3 pr-9 text-left text-sm transition disabled:cursor-not-allowed ${
                      active ? 'bg-calisto-surface-muted font-semibold text-calisto-ink' : 'text-calisto-body hover:bg-calisto-surface-muted'
                    }`}
                    disabled={isSending && !active}
                    onClick={() => openConversation(conversation)}
                    title={conversation.title}
                    type="button"
                  >
                    <span className="truncate">{conversation.title}</span>
                  </button>
                  <button
                    aria-label={`Delete conversation: ${conversation.title}`}
                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-calisto-muted opacity-0 transition hover:bg-calisto-line hover:text-calisto-ink focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => deleteConversation(conversation.id)}
                    title="Delete"
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>
    </aside>
  )

  const guidedPanel = (
    <GuidedShoppingPanel
      brands={guidedBrands}
      budget={guidedBudget}
      category={guidedCategory}
      selectedBrand={guidedBrand}
      selectedInStock={guidedInStock}
      disabled={isSending}
      onBack={() => {
        if (guidedStep === 'preferences') {
          setGuidedStep('budget')
          void sendMessage('Back', 'Back', { action: 'back', value: 'budget', eventId: eventId() }, true)
        } else resetGuidedFlow()
      }}
      onCategory={(category) => beginGuidedCategory(category)}
      onChooseBudget={(budget) => void chooseGuidedBudget(budget)}
      onExplore={exploreProducts}
      onReset={resetGuidedFlow}
      onSearch={submitGuidedSearch}
      step={guidedStep}
    />
  )

  return (
    // Claude-style layout: conversation sidebar on the left; the main area has a
    // slim top bar and one centred column. Before the first message the greeting
    // and composer sit in the middle; after it, the transcript fills the page
    // (scrollbar at the window edge) and the composer docks at the bottom.
    <div className="flex h-[100dvh] bg-calisto-canvas">
      {mobileSidebarOpen && (
        <div aria-hidden="true" className="fixed inset-0 z-30 bg-calisto-ink/40 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}
      {sidebar}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              aria-label="Open sidebar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-calisto-body transition hover:bg-calisto-surface lg:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img className="h-6 w-auto brightness-0 lg:hidden" src={calistoLogo} alt="Calisto" />
          </div>
          </header>

        {!hasConversation ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh]">
            <div className="w-full max-w-3xl">
              {guidedPanel}
              {composer}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {promptOptions.map((option) => (
                  <button
                    className="rounded-full border border-calisto-line bg-calisto-surface px-3.5 py-1.5 text-sm font-medium text-calisto-ink transition hover:border-calisto-accent/40 hover:bg-calisto-surface-muted disabled:opacity-60"
                    disabled={isSending}
                    key={option.value}
                    onClick={() => void sendMessage(option.value, option.display ?? option.label)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={transcriptRef}>
              <div className="mx-auto grid w-full max-w-3xl content-start gap-6 px-4 py-6">
                {guidedStep !== 'closed' && guidedPanel}
                {messages.map((entry) => (
                  <ChatMessageBubble
                    assistantLabel="Calisto Assistant"
                    content={entry.content}
                    customerLabel="You"
                    direction={entry.direction}
                    key={entry.id}
                    onPostback={handlePostback}
                    payload={entry.payload}
                    timestamp={entry.timestamp}
                    variant="chatbot"
                  />
                ))}

                {isSending && (
                  <div aria-label="Calisto Assistant is typing" className="flex items-center gap-1.5 py-2" role="status">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-calisto-muted" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-calisto-muted [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-calisto-muted [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 px-4 pb-4 pt-2">
              <div className="mx-auto w-full max-w-3xl">
                {error && (
                  <div className="mb-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
                    {error}
                  </div>
                )}
                {composer}
                <p className="mt-2 text-center text-xs text-calisto-soft">
                  Calisto Assistant can make mistakes. Please check important details with our store.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
