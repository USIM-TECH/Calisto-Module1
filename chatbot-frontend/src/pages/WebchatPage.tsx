import { useEffect, useMemo, useRef, useState } from 'react'
import { postWebchatMessage } from '../api/client'
import type { OutgoingMessage, WebchatResponse } from '../types'

interface ChatBubble {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  payload?: OutgoingMessage
  timestamp: string
}

export default function WebchatPage() {
  const [senderId, setSenderId] = useState('website-demo-user')
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
    const now = new Date().toLocaleString('en-MY')
    setBubbles((prev) => [...prev, { id: `${Date.now()}-user`, direction: 'inbound', content: trimmed, timestamp: now }])
    setMessage('')
    setLoading(true)
    setStatus('Sending')

    try {
      const response: WebchatResponse = await postWebchatMessage({ senderId, message: trimmed })
      const botBubbles = response.messages.map((msg, index) => {
        const stamp = new Date().toLocaleString('en-MY')
        const content = msg.type === 'text'
          ? msg.text
          : msg.type === 'choice'
            ? msg.text
            : msg.type === 'card'
              ? msg.title
              : ''
        return {
          id: `${Date.now()}-bot-${index}`,
          direction: 'outbound' as const,
          content,
          payload: msg,
          timestamp: stamp,
        }
      })
      setBubbles((prev) => [...prev, ...botBubbles])
      setStatus('Ready')
    } catch (error: any) {
      setStatus(error.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  function handleChoice(value: string) {
    sendMessage(value)
  }

  return (
    <>
      <main className="page">
        <header className="page-header">
          <div className="page-title">Website Chat Console</div>
          <div className="header-actions">
            <button className="btn" onClick={() => setBubbles([])} type="button">Reset Session</button>
            <button className="btn dark" type="button" disabled={loading} onClick={() => sendMessage(message)}>Live Test</button>
          </div>
        </header>
        <div className="page-body">
          <div className="page-inner">
            <section className="metric-grid" style={{ marginBottom: 24 }}>
              <article className="metric-card blue">
                <div className="metric-head">
                  <span className="metric-label">Channel</span>
                  <span>◌</span>
                </div>
                <div className="metric-value" style={{ fontSize: '1.8rem' }}>Website</div>
                <div className="metric-note">Directly calls <strong>/webchat/message</strong></div>
              </article>
              <article className="metric-card green">
                <div className="metric-head">
                  <span className="metric-label">Session</span>
                  <span>◌</span>
                </div>
                <div className="metric-value" id="sessionLabel" style={{ fontSize: '1.8rem' }}>{senderId || 'demo-user'}</div>
                <div className="metric-note">Sender id used for local testing</div>
              </article>
              <article className="metric-card amber">
                <div className="metric-head">
                  <span className="metric-label">Status</span>
                  <span>◌</span>
                </div>
                <div className="metric-value" id="statusLabel" style={{ fontSize: '1.8rem' }}>{status}</div>
                <div className="metric-note">Replies appear in the conversation panel</div>
              </article>
            </section>

            <section className="detail-grid">
              <article className="panel">
                <div className="panel-head">
                  <div className="panel-title">Test Controls</div>
                </div>
                <div className="panel-body">
                  <div className="overview-grid">
                    <div>
                      <div className="field-label">Sender ID</div>
                      <input
                        id="senderIdInput"
                        className="note-input"
                        type="text"
                        value={senderId}
                        onChange={(event) => setSenderId(event.target.value)}
                      />
                    </div>
                    <div>
                      <div className="field-label">Suggested Prompts</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button className="btn prompt-chip" type="button" onClick={() => setMessage('hi')}>hi</button>
                        <button className="btn prompt-chip" type="button" onClick={() => setMessage('/browse_eyewear')}>browse eyewear</button>
                        <button className="btn prompt-chip" type="button" onClick={() => setMessage('/find_a_store')}>find a store</button>
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="field-label">Request Composer</div>
                      <textarea
                        id="messageInput"
                        className="chat-input"
                        placeholder="Type a message like: hi"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                      />
                      <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button id="clearChatButton" className="btn" type="button" onClick={() => setBubbles([])}>Clear Chat</button>
                        <button id="sendButton" className="btn dark" type="button" disabled={loading} onClick={() => sendMessage(message)}>Send Message</button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="panel transcript">
                <div className="panel-head">
                  <div className="panel-title">Conversation Preview</div>
                  <span id="messageCountLabel" style={{ color: '#9ca3af', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {bubbleCount} Message{bubbleCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div id="messages" className="transcript-list" ref={transcriptRef}>
                  {bubbles.length === 0 && (
                    <div style={{ color: 'var(--muted)' }}>Send a message to see replies.</div>
                  )}
                  {bubbles.map((bubble) => (
                    <div key={bubble.id} className={`bubble-wrap ${bubble.direction}`}>
                      <div className={`bubble ${bubble.direction}`}>
                        <div className="bubble-text">{bubble.content}</div>
                        {bubble.payload?.type === 'choice' && (
                          <div className="choice-group">
                            {bubble.payload.options.map((option) => (
                              <button key={option.value} className="choice-button" type="button" onClick={() => handleChoice(option.value)}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {bubble.payload?.type === 'card' && (
                          <div className="card-list">
                            <div className="card-item">
                              {bubble.payload.imageUrl && (
                                <img className="card-media" src={bubble.payload.imageUrl} alt={bubble.payload.title} />
                              )}
                              <div className="card-title">{bubble.payload.title}</div>
                              {bubble.payload.subtitle && <div className="card-subtitle">{bubble.payload.subtitle}</div>}
                              {bubble.payload.actions && bubble.payload.actions.length > 0 && (
                                <div className="card-actions">
                                  {bubble.payload.actions.map((action) => (
                                    <button key={action.value} className="card-action" type="button" onClick={() => handleChoice(action.value)}>
                                      {action.title}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="bubble-meta">
                        {bubble.direction === 'outbound' ? 'Outbound (AI Assistant)' : 'Inbound'} • {bubble.timestamp}
                      </span>
                    </div>
                  ))}
                  {loading && (
                    <div className="bubble-wrap outbound">
                      <div className="bubble outbound">
                        <div className="typing">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                      <span className="bubble-meta">Outbound (AI Assistant) • {new Date().toLocaleString('en-MY')}</span>
                    </div>
                  )}
                </div>
                <div className="transcript-footer">
                  <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>
                    Reply buttons from Rasa will show as clickable chips inside the assistant bubbles.
                  </div>
                </div>
              </article>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
