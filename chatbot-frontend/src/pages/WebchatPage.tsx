import { Circle, Globe2, MessageSquareText, RotateCcw, Send, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { postWebchatMessage } from '../api/client'
import Button from '../components/Button'
import ChatMessageBubble from '../components/ChatMessageBubble'
import PageContainer from '../components/PageContainer'
import Topbar from '../components/Topbar'
import { getOrCreateSenderId, messagePreview, persistSenderId, resetSenderId } from '../lib/chat'
import type { WebchatResponse } from '../types'

interface ChatBubble {
  content: string
  direction: 'customer' | 'assistant'
  id: string
  payload?: WebchatResponse['messages'][number]
  timestamp: string
}

const WEBCHAT_SCOPE = 'website-admin'

const metrics = [
  { icon: Globe2, label: 'Channel', trend: 'Website' },
  { icon: UserRound, label: 'Session', trend: 'Demo' },
  { icon: Circle, label: 'Status', trend: 'Live' },
]

function currentStamp() {
  return new Date().toLocaleString('en-MY')
}

export default function WebchatPage() {
  const [senderId, setSenderId] = useState(() => getOrCreateSenderId(WEBCHAT_SCOPE))
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('Ready')
  const [bubbles, setBubbles] = useState<ChatBubble[]>([])
  const [loading, setLoading] = useState(false)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  const bubbleCount = useMemo(() => bubbles.length, [bubbles])

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [bubbles, loading])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const trimmed = text.trim()
    setBubbles((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, direction: 'customer', content: trimmed, timestamp: currentStamp() },
    ])
    setMessage('')
    setLoading(true)
    setStatus('Sending')

    try {
      const response: WebchatResponse = await postWebchatMessage({ senderId, message: trimmed })
      persistSenderId(response.senderId, WEBCHAT_SCOPE)
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
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  function handleResetSession() {
    const nextSenderId = resetSenderId(WEBCHAT_SCOPE)
    setSenderId(nextSenderId)
    setBubbles([])
    setStatus('Ready')
  }

  const metricValues = [
    { value: 'Website', note: <>Directly calls <strong>/webchat/message</strong></> },
    { value: senderId || 'demo-user', note: 'Sender id used for local testing' },
    { value: status, note: 'Replies appear in the conversation panel' },
  ]

  return (
    <PageContainer>
      <Topbar
        title="Website Chat Console"
        actions={(
          <>
            <Button icon={<RotateCcw className="h-4 w-4" />} onClick={handleResetSession}>Reset Session</Button>
            <Button icon={<Sparkles className="h-4 w-4" />} variant="primary" disabled={loading} onClick={() => sendMessage(message)}>Live Test</Button>
          </>
        )}
      />

      <section className="mb-6 grid gap-5 xl:grid-cols-3">
        {metrics.map(({ icon: Icon, label, trend }, index) => (
          <article key={label} className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-6 shadow-dashboard">
            <div className="mb-5 flex items-start justify-between gap-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{trend}</span>
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-calisto-muted">{label}</div>
            <div id={index === 1 ? 'sessionLabel' : index === 2 ? 'statusLabel' : undefined} className="mt-2 truncate text-3xl font-semibold leading-none text-indigo-900">{metricValues[index].value}</div>
            <div className="mt-3 text-xs text-calisto-muted">{metricValues[index].note}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
        <article className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
          <div className="border-b border-calisto-line px-5 py-4">
            <h2 className="text-base font-extrabold text-calisto-ink">Test Controls</h2>
          </div>
          <div className="p-5">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-[0.68rem] font-extrabold uppercase tracking-wider text-calisto-soft" htmlFor="senderIdInput">Sender ID</label>
                <input
                  id="senderIdInput"
                  className="h-12 w-full rounded-xl border border-calisto-line bg-calisto-table px-4 text-sm text-calisto-body outline-none transition focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  type="text"
                  value={senderId}
                  onChange={(event) => {
                    const next = event.target.value
                    setSenderId(next)
                    persistSenderId(next, WEBCHAT_SCOPE)
                  }}
                />
              </div>
              <div>
                <div className="mb-2 text-[0.68rem] font-extrabold uppercase tracking-wider text-calisto-soft">Suggested Prompts</div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted" type="button" onClick={() => setMessage('hi')}>hi</button>
                  <button className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted" type="button" onClick={() => setMessage('/browse_eyewear')}>browse eyewear</button>
                  <button className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted" type="button" onClick={() => setMessage('/find_a_store')}>find a store</button>
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="mb-2 block text-[0.68rem] font-extrabold uppercase tracking-wider text-calisto-soft" htmlFor="messageInput">Request Composer</label>
                <textarea
                  id="messageInput"
                  className="min-h-28 w-full resize-y rounded-xl border border-calisto-line bg-calisto-surface-muted p-4 text-sm leading-6 text-calisto-ink outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus"
                  placeholder="Type a message like: hi"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage(message)
                    }
                  }}
                />
                <div className="mt-3 flex flex-wrap justify-end gap-3">
                  <Button id="clearChatButton" onClick={() => setBubbles([])}>Clear Chat</Button>
                  <Button id="sendButton" icon={<Send className="h-4 w-4" />} variant="primary" disabled={loading} onClick={() => sendMessage(message)}>Send Message</Button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="flex min-h-[640px] flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
          <div className="flex items-center justify-between gap-3 border-b border-calisto-line px-5 py-4">
            <h2 className="text-base font-extrabold text-calisto-ink">Conversation Preview</h2>
            <span id="messageCountLabel" className="text-[0.72rem] font-extrabold uppercase tracking-wider text-calisto-soft">
              {bubbleCount} Message{bubbleCount === 1 ? '' : 's'}
            </span>
          </div>
          <div id="messages" className="grid max-h-[520px] flex-1 content-start gap-4 overflow-y-auto bg-calisto-surface-muted p-5" ref={transcriptRef}>
            {bubbles.length === 0 && (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-calisto-line bg-calisto-surface text-center text-sm font-medium text-calisto-muted">
                <MessageSquareText className="h-7 w-7 text-calisto-soft/70" />
                Send a message to see replies.
              </div>
            )}
            {bubbles.map((bubble) => (
              <ChatMessageBubble
                assistantLabel="Outbound (AI Assistant)"
                content={bubble.content}
                customerLabel="Inbound"
                direction={bubble.direction}
                key={bubble.id}
                onPostback={sendMessage}
                payload={bubble.payload}
                timestamp={bubble.timestamp}
                variant="console"
              />
            ))}
            {loading && (
              <div className="flex flex-col items-end gap-1">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-blue-600 px-4 py-3 text-calisto-surface shadow-sm">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-calisto-surface/90" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-calisto-surface/90 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-calisto-surface/90 [animation-delay:300ms]" />
                  </div>
                </div>
                <span className="text-xs font-semibold text-calisto-soft">Outbound (AI Assistant) - {currentStamp()}</span>
              </div>
            )}
          </div>
          <div className="border-t border-calisto-line bg-calisto-surface px-5 py-4 text-sm text-calisto-muted">
            Reply buttons from Rasa will show as clickable chips inside the assistant bubbles.
          </div>
        </article>
      </section>
    </PageContainer>
  )
}
