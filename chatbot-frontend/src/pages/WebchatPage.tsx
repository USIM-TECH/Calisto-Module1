import { Circle, ExternalLink, Globe2, History, MessageSquareText, Plus, Send, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getWebchatSettings, postWebchatMessage, updateWebchatSettings } from '../api/client'
import Button from '../components/Button'
import ChatMessageBubble from '../components/ChatMessageBubble'
import PageContainer from '../components/PageContainer'
import ResponseModeSelect, { RESPONSE_MODE_HELP } from '../components/ResponseModeSelect'
import { useSnackbar } from '../components/Snackbar'
import { TypingIndicator } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import { getOrCreateSenderId, messagePreview, persistSenderId, resetSenderId } from '../lib/chat'
import { conversationTitle, loadConversations, saveConversations, type StoredConversation } from '../lib/chat-history'
import { displayName, useCurrentUser } from '../lib/current-user'
import type { ResponseMode, WebchatResponse } from '../types'

interface ChatBubble {
  content: string
  direction: 'customer' | 'assistant'
  id: string
  payload?: WebchatResponse['messages'][number]
  timestamp: string
}

const WEBCHAT_SCOPE = 'website-admin'

// The console keeps its session id and chats in localStorage, so closing the tab and coming back
// resumes the same conversation (one lead identity) instead of starting a new session each visit.
// Kept apart from the public chatbot's history. This is browser-side only: deleting a chat here
// removes it from this list, not the lead's record on the server.
const SENDER_STORAGE = 'local' as const
const HISTORY_KEY = 'calisto-console-conversations'

function formatUpdated(timestamp: number) {
  const date = new Date(timestamp)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
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

export default function WebchatPage() {
  // The sender id stays internal (sent to the backend); the UI shows who is chatting.
  const currentUser = useCurrentUser()
  const snackbar = useSnackbar()
  const [responseMode, setResponseMode] = useState<ResponseMode | null>(null)
  const [savingMode, setSavingMode] = useState(false)
  const senderName = displayName(currentUser)
  const [senderId, setSenderId] = useState(() => getOrCreateSenderId(WEBCHAT_SCOPE, SENDER_STORAGE))
  const [conversations, setConversations] = useState<StoredConversation<ChatBubble>[]>(() => loadConversations<ChatBubble>(HISTORY_KEY))
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'Ready' | 'Sending' | 'Failed'>('Ready')
  const [error, setError] = useState<string | null>(null)
  // Reopening the console shows the conversation this session id belongs to.
  const [bubbles, setBubbles] = useState<ChatBubble[]>(
    () => conversations.find((conversation) => conversation.id === senderId)?.messages ?? [],
  )
  const loading = status === 'Sending'
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    getWebchatSettings()
      .then((settings) => setResponseMode(settings.responseMode))
      .catch(() => setResponseMode(null))
  }, [])

  async function handleResponseMode(mode: ResponseMode) {
    setSavingMode(true)
    try {
      const saved = await updateWebchatSettings(mode)
      setResponseMode(saved.responseMode)
      snackbar.success(`Website chat now uses ${mode === 'chat' ? 'Chat' : 'Payload'} mode.`)
    } catch (caught: unknown) {
      snackbar.error(caught instanceof Error ? caught.message : 'Failed to change response mode')
    } finally {
      setSavingMode(false)
    }
  }

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, loading])

  // Save the open conversation to the history list whenever it gains messages.
  useEffect(() => {
    if (bubbles.length === 0) return
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === senderId)
      if (existing && existing.messages.length === bubbles.length) return current // just reopened
      const updated: StoredConversation<ChatBubble> = {
        id: senderId,
        title: conversationTitle(bubbles),
        updatedAt: Date.now(),
        messages: bubbles,
      }
      const next = [updated, ...current.filter((conversation) => conversation.id !== senderId)]
      saveConversations(next, HISTORY_KEY)
      return next
    })
  }, [bubbles, senderId])

  // Shrink the auto-growing composer back to one line once the message is sent.
  useEffect(() => {
    if (!message && composerRef.current) composerRef.current.style.height = ''
  }, [message])

  async function sendMessage(text: string, displayText?: string) {
    if (!text.trim() || loading) return
    const trimmed = text.trim()
    const visible = (displayText ?? trimmed).trim()
    setBubbles((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, direction: 'customer', content: visible, timestamp: currentStamp() },
    ])
    setMessage('')
    setStatus('Sending')
    setError(null)

    try {
      // Send the signed-in admin's identity so the lead shows their name, not "Unknown Customer".
      const response: WebchatResponse = await postWebchatMessage({
        senderId,
        message: trimmed,
        name: currentUser.name?.trim() || undefined,
        email: currentUser.email,
      })
      persistSenderId(response.senderId, WEBCHAT_SCOPE, SENDER_STORAGE)
      setSenderId(response.senderId)

      const botBubbles = response.messages.map((msg, index) => ({
        id: `${Date.now()}-bot-${index}`,
        direction: 'assistant' as const,
        content: messagePreview(msg),
        payload: msg,
        timestamp: currentStamp(),
      }))
      setBubbles((prev) => [...prev, ...botBubbles])
      setStatus('Ready')
    } catch (caught: unknown) {
      setStatus('Failed')
      setError(caught instanceof Error ? caught.message : 'Message failed.')
    }
  }

  function startNewChat() {
    setSenderId(resetSenderId(WEBCHAT_SCOPE, SENDER_STORAGE))
    setBubbles([])
    setMessage('')
    setError(null)
    setStatus('Ready')
  }

  function openConversation(conversation: StoredConversation<ChatBubble>) {
    if (loading || conversation.id === senderId) return
    persistSenderId(conversation.id, WEBCHAT_SCOPE, SENDER_STORAGE)
    setSenderId(conversation.id)
    setBubbles(conversation.messages)
    setMessage('')
    setError(null)
    setStatus('Ready')
  }

  function deleteConversation(conversation: StoredConversation<ChatBubble>) {
    if (loading) return
    setConversations((current) => {
      const next = current.filter((entry) => entry.id !== conversation.id)
      saveConversations(next, HISTORY_KEY)
      return next
    })
    if (conversation.id === senderId) startNewChat()
  }

  function clearHistory() {
    if (loading || conversations.length === 0) return
    if (!window.confirm('Delete all saved chats from this browser? Leads already created are not affected.')) return
    setConversations([])
    saveConversations([], HISTORY_KEY)
    startNewChat()
  }

  const details = [
    { icon: UserRound, label: 'Chatting as', value: senderName },
    { icon: Globe2, label: 'Channel', value: 'Website' },
  ]

  return (
    // On large screens the page fits the viewport and only the transcript scrolls.
    <PageContainer className="xl:flex xl:h-[100dvh] xl:flex-col">
      <Topbar
        title="Website Chat Console"
        actions={(
          <>
            <Button disabled={loading} icon={<Plus className="h-4 w-4" />} onClick={startNewChat}>New Chat</Button>
            <Button
              icon={<ExternalLink className="h-4 w-4" />}
              variant="primary"
              onClick={() => window.open('/chatbot', '_blank', 'noopener,noreferrer')}
              title="Open the customer-facing chatbot in a new tab"
            >
              Live Test
            </Button>
          </>
        )}
      />

      <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Below xl the conversation comes first so the chat is visible without scrolling. */}
        <aside className="order-last flex flex-col gap-5 rounded-2xl border border-calisto-line bg-calisto-surface p-5 shadow-dashboard xl:order-none xl:overflow-y-auto">
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-calisto-muted">Session</h2>
            <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {details.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-calisto-table text-calisto-body">
                    <Icon className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs text-calisto-muted">{label}</dt>
                    <dd className="truncate text-sm font-semibold text-calisto-ink">{value}</dd>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-calisto-table">
                  <Circle
                    className={`h-2.5 w-2.5 ${
                      status === 'Failed'
                        ? 'fill-rose-500 text-rose-500'
                        : status === 'Sending'
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-emerald-500 text-emerald-500'
                    }`}
                  />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs text-calisto-muted">Status</dt>
                  <dd className="truncate text-sm font-semibold text-calisto-ink">{status}</dd>
                </div>
              </div>
            </dl>
          </section>

          {responseMode && (
            <section className="border-t border-calisto-line-subtle pt-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-calisto-muted">Response mode</h2>
              <ResponseModeSelect
                aria-label="Website chat response mode"
                disabled={savingMode}
                onChange={(mode) => void handleResponseMode(mode)}
                value={responseMode}
              />
              <p className="mt-2 text-xs leading-5 text-calisto-muted">
                {RESPONSE_MODE_HELP[responseMode]} Applies to the website chat; start a new chat to try it.
              </p>
            </section>
          )}

          <section className="border-t border-calisto-line-subtle pt-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-calisto-muted">Chat history</h2>
              {conversations.length > 0 && (
                <button
                  className="text-xs font-semibold text-calisto-muted transition hover:text-rose-700 disabled:opacity-50"
                  disabled={loading}
                  onClick={clearHistory}
                  type="button"
                >
                  Clear all
                </button>
              )}
            </div>
            {conversations.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-calisto-muted">
                <History className="h-4 w-4 shrink-0" /> Your chats are saved here.
              </p>
            ) : (
              <ul className="-mx-1 grid max-h-64 gap-1 overflow-y-auto px-1">
                {conversations.map((conversation) => {
                  const active = conversation.id === senderId
                  return (
                    <li className={`group flex items-center gap-1 rounded-lg ${active ? 'bg-calisto-accent/[0.08]' : 'hover:bg-calisto-surface-muted'}`} key={conversation.id}>
                      <button
                        aria-current={active ? 'true' : undefined}
                        className="min-w-0 flex-1 px-2.5 py-2 text-left disabled:cursor-not-allowed"
                        disabled={loading}
                        onClick={() => openConversation(conversation)}
                        type="button"
                      >
                        <span className={`block truncate text-sm ${active ? 'font-semibold text-calisto-accent' : 'font-medium text-calisto-ink'}`}>{conversation.title}</span>
                        <span className="block text-xs text-calisto-muted">{formatUpdated(conversation.updatedAt)} · {conversation.messages.length} message{conversation.messages.length === 1 ? '' : 's'}</span>
                      </button>
                      <button
                        aria-label={`Delete chat: ${conversation.title}`}
                        className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-calisto-muted transition hover:bg-rose-50 hover:text-rose-700 focus-visible:bg-rose-50 disabled:opacity-50"
                        disabled={loading}
                        onClick={() => deleteConversation(conversation)}
                        title="Delete from history"
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="border-t border-calisto-line-subtle pt-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-calisto-muted">Suggested prompts</h2>
            <div className="flex flex-wrap gap-2">
              {promptOptions.map((option) => (
                <button
                  className="rounded-full border border-calisto-line bg-calisto-surface px-3.5 py-1.5 text-sm font-medium text-calisto-ink transition hover:border-calisto-accent/40 hover:bg-calisto-surface-muted disabled:opacity-60"
                  disabled={loading}
                  key={option.value}
                  onClick={() => void sendMessage(option.value, option.display ?? option.label)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

        </aside>

        {/* Below lg the sticky top nav (~11rem) shares the screen, so leave room for it. */}
        <section className="flex h-[calc(100dvh-11rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard xl:h-auto xl:min-h-0">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-calisto-line px-5 py-3.5">
            <h2 className="text-base font-bold text-calisto-ink">Conversation</h2>
            {bubbles.length > 0 && (
              <span className="text-xs text-calisto-muted">
                {bubbles.length} message{bubbles.length === 1 ? '' : 's'}
              </span>
            )}
          </header>

          <div
            id="messages"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-calisto-surface-muted px-5 py-5"
            ref={transcriptRef}
          >
            <div className="flex min-h-full flex-col gap-4">
              {bubbles.length === 0 && !loading && (
                <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-calisto-line bg-calisto-surface px-4 text-center text-sm text-calisto-muted">
                  <MessageSquareText className="h-7 w-7 text-calisto-soft/70" />
                  Send a message or pick a suggested prompt to start.
                </div>
              )}
              {bubbles.map((bubble) => (
                <ChatMessageBubble
                  assistantLabel="AI Assistant"
                  content={bubble.content}
                  customerLabel={senderName}
                  direction={bubble.direction}
                  key={bubble.id}
                  onPostback={sendMessage}
                  payload={bubble.payload}
                  timestamp={bubble.timestamp}
                  variant="console"
                />
              ))}
              {loading && (
                <div className="flex flex-col items-start gap-1.5">
                  <TypingIndicator />
                  <span className="px-1 text-xs text-calisto-soft">AI Assistant is typing…</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="shrink-0 border-t border-rose-100 bg-rose-50 px-5 py-2.5 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          <div className="flex shrink-0 items-end gap-3 border-t border-calisto-line bg-calisto-surface px-5 py-4">
            <textarea
              id="messageInput"
              aria-label="Message"
              className="max-h-40 min-h-12 flex-1 resize-none rounded-xl border border-calisto-line bg-calisto-surface px-4 py-3 text-sm leading-6 text-calisto-ink outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
              placeholder="Type a message…"
              title="Enter to send, Shift+Enter for a new line"
              ref={composerRef}
              rows={1}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                // Grow with the text up to max-h-40, then scroll inside the box.
                event.target.style.height = 'auto'
                event.target.style.height = `${event.target.scrollHeight}px`
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage(message)
                }
              }}
            />
            <Button
              id="sendButton"
              aria-label="Send message"
              className="h-12 w-12 shrink-0 gap-0 !px-0 sm:w-auto sm:gap-2 sm:!px-5"
              icon={<Send className="h-4 w-4" />}
              variant="primary"
              disabled={loading || !message.trim()}
              onClick={() => sendMessage(message)}
            >
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </section>
      </div>
    </PageContainer>
  )
}
