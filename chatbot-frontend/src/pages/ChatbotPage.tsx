import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Circle, RotateCcw, Send } from 'lucide-react'
import { postWebchatMessage } from '../api/client'
import Button from '../components/Button'
import ChatMessageBubble from '../components/ChatMessageBubble'
import PageContainer from '../components/PageContainer'
import calistoLogo from '../../calisto.svg'
import {
  getOrCreateSenderId,
  messagePreview,
  persistSenderId,
  resetSenderId,
} from '../lib/chat'
import type { OutgoingMessage, WebchatResponse } from '../types'

interface ConsoleMessage {
  content: string
  direction: 'customer' | 'assistant'
  id: string
  payload?: OutgoingMessage
  timestamp: string
}

const promptOptions = [
  { label: 'Start conversation', value: 'hi' },
  { label: 'Browse eyewear', value: '/browse_eyewear' },
  { label: 'Find a store', value: '/find_a_store' },
  { label: 'Book appointment', value: 'I want to book an eye test appointment' },
]

function currentStamp() {
  return new Date().toLocaleString('en-MY')
}

const WEBCHAT_SCOPE = 'website-chatbot'

export default function ChatbotPage() {
  const [senderId, setSenderId] = useState(() => getOrCreateSenderId(WEBCHAT_SCOPE))
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'Ready' | 'Sending' | 'Failed'>('Ready')
  const [messages, setMessages] = useState<ConsoleMessage[]>([
    {
      content: 'Chat ready. Send "hi" to start a live bot conversation.',
      direction: 'assistant',
      id: 'welcome',
      timestamp: currentStamp(),
    },
  ])
  const [error, setError] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  const isSending = status === 'Sending'
  const messageCount = useMemo(() => messages.length, [messages])

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages, isSending])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    setMessages((current) => [
      ...current,
      {
        content: trimmed,
        direction: 'customer',
        id: `${Date.now()}-customer`,
        timestamp: currentStamp(),
      },
    ])
    setMessage('')
    setStatus('Sending')
    setError(null)

    try {
      const response: WebchatResponse = await postWebchatMessage({ senderId, message: trimmed })
      persistSenderId(response.senderId, WEBCHAT_SCOPE)
      setSenderId(response.senderId)

      const replies = response.messages.length
        ? response.messages
        : [{ type: 'text' as const, text: 'No reply from the assistant.' }]

      setMessages((current) => [
        ...current,
        ...replies.map((reply, index) => ({
          content: messagePreview(reply),
          direction: 'assistant' as const,
          id: `${Date.now()}-assistant-${index}`,
          payload: reply,
          timestamp: currentStamp(),
        })),
      ])
      setStatus('Ready')
    } catch (caught) {
      setStatus('Failed')
      setError(caught instanceof Error ? caught.message : 'Message failed.')
    }
  }

  function handleResetSession() {
    const nextSenderId = resetSenderId(WEBCHAT_SCOPE)
    setSenderId(nextSenderId)
    setMessages([
      {
        content: 'Session reset. Send "hi" to start a new conversation.',
        direction: 'assistant',
        id: 'reset',
        timestamp: currentStamp(),
      },
    ])
    setError(null)
    setStatus('Ready')
  }

  return (
    <PageContainer>
      <div className="grid min-h-[calc(100vh-4rem)] gap-6 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.45fr)]">
        <aside className="overflow-hidden rounded-3xl border border-calisto-line bg-calisto-surface p-7 shadow-dashboard">
          <img className="mx-auto h-10 w-auto brightness-0" src={calistoLogo} alt="Calisto" />

          <div className="mt-10">
            <h1 className="max-w-sm text-5xl font-extrabold leading-[1.03] tracking-normal text-calisto-ink">
              Your eyewear assistant, on the website.
            </h1>
            <p className="mt-5 max-w-md text-base font-medium leading-7 text-calisto-muted">
              Validate product discovery, store lookup, bookings, and lead capture flows before customers see them.
            </p>
          </div>

          <div className="mt-8 grid gap-4">
            {[
              'Product discovery and recommendations',
              'Store finder and booking flow',
              'Lead capture for follow-up',
            ].map((item) => (
              <div className="flex gap-3 text-base font-bold leading-6 text-calisto-body" key={item}>
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-calisto-accent" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-3xl border border-calisto-line bg-calisto-surface shadow-dashboard">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-calisto-line px-6 py-5">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-calisto-accent" />
                <h2 className="text-xl font-extrabold text-calisto-ink">Website Support Chat</h2>
              </div>
              <p className="mt-1 text-sm font-medium text-calisto-muted">
                Connected to <strong>POST /webchat/message</strong> on the integration API.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button icon={<RotateCcw className="h-4 w-4" />} onClick={handleResetSession} variant="secondary">
                Reset
              </Button>
              <span className="inline-flex items-center gap-2 rounded-full border border-calisto-line bg-calisto-table px-4 py-2 text-sm font-extrabold text-calisto-body">
                <Circle className="h-2.5 w-2.5 fill-calisto-accent text-calisto-accent" />
                {status}
              </span>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6" ref={transcriptRef}>
              <div className="grid content-start gap-5">
                {messages.map((entry) => (
                  <ChatMessageBubble
                    assistantLabel="Calisto Assistant"
                    content={entry.content}
                    customerLabel="You"
                    direction={entry.direction}
                    key={entry.id}
                    onPostback={sendMessage}
                    payload={entry.payload}
                    timestamp={entry.timestamp}
                    variant="chatbot"
                  />
                ))}

                {isSending && (
                  <div className="flex flex-col items-start gap-2">
                    <div className="rounded-2xl rounded-bl-md bg-calisto-table px-5 py-4 shadow-sm">
                      <span className="inline-flex gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-calisto-muted" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-calisto-muted [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-calisto-muted [animation-delay:300ms]" />
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-calisto-soft">Calisto Assistant - {currentStamp()}</span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="border-t border-calisto-line-subtle bg-calisto-table px-6 py-3 text-sm font-semibold text-calisto-body">
                {error}
              </div>
            )}

            <div className="shrink-0 border-t border-calisto-line bg-calisto-surface px-6 py-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {promptOptions.map((option) => (
                  <button
                    className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-xs font-bold text-calisto-ink transition hover:bg-calisto-surface-muted"
                    key={option.value}
                    onClick={() => setMessage(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <textarea
                  className="min-h-20 flex-1 resize-none rounded-2xl border border-calisto-line bg-calisto-surface px-4 py-4 text-sm font-medium leading-6 text-calisto-body outline-none placeholder:text-calisto-soft focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus"
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage(message)
                    }
                  }}
                  placeholder="Type your message..."
                  value={message}
                />
                <Button
                  className="h-auto min-h-20 rounded-2xl px-8"
                  disabled={isSending || !message.trim()}
                  icon={<Send className="h-4 w-4" />}
                  onClick={() => sendMessage(message)}
                  variant="primary"
                >
                  Send
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-calisto-muted">
                <span>Session: {senderId}</span>
                <span>{messageCount} message{messageCount === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageContainer>
  )
}
