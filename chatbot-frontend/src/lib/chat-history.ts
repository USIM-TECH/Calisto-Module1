// Recent chatbot conversations, kept in the visitor's browser (localStorage) for
// the /chatbot sidebar. The conversation id is the webchat sender id, so reopening
// one continues the same conversation on the bot side.

export interface StoredConversation<TMessage> {
  id: string
  title: string
  updatedAt: number
  /** Set once the AI-generated title is applied; it then stops following the first message. */
  aiTitle?: boolean
  messages: TMessage[]
}

const STORAGE_KEY = 'calisto-chatbot-conversations'
const MAX_CONVERSATIONS = 30

export function loadConversations<TMessage>(storageKey = STORAGE_KEY): StoredConversation<TMessage>[] {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? (JSON.parse(raw) as StoredConversation<TMessage>[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Storage blocked (private mode) or corrupted: start with an empty history.
    return []
  }
}

export function saveConversations<TMessage>(conversations: StoredConversation<TMessage>[], storageKey = STORAGE_KEY): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)))
  } catch {
    // Quota exceeded or storage blocked: history just won't persist.
  }
}

// Openers that say nothing about the topic; a title waits for a real message.
export const SMALL_TALK = /^(hi+|hello+|hey+|hiya|yo|good (morning|afternoon|evening)|assalamualaikum|salam|thanks?|thank you|ok(ay)?)\b[\s!.,?]*$/i

// Names the conversation after its first meaningful customer message, so a
// leading "Hi" doesn't become the title. Updates as the topic emerges.
export function conversationTitle(messages: Array<{ direction: 'customer' | 'assistant'; content: string }>): string {
  const customerTexts = messages
    .filter((entry) => entry.direction === 'customer')
    .map((entry) => entry.content.trim())
    .filter(Boolean)
  const topic = customerTexts.find((text) => !SMALL_TALK.test(text))
  if (!topic) return customerTexts.length > 0 ? 'Greeting' : 'New conversation'
  return topic.length > 48 ? `${topic.slice(0, 48)}…` : topic
}

const PREFS_KEY = 'calisto-chatbot-sidebar-collapsed'

export function loadSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(PREFS_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(PREFS_KEY, collapsed ? '1' : '0')
  } catch {
    // Not critical.
  }
}
