// Recent chatbot conversations, kept in the visitor's browser (localStorage) for
// the /chatbot sidebar. The conversation id is the webchat sender id, so reopening
// one continues the same conversation on the bot side.

export interface StoredConversation<TMessage> {
  id: string
  title: string
  updatedAt: number
  messages: TMessage[]
}

const STORAGE_KEY = 'calisto-chatbot-conversations'
const MAX_CONVERSATIONS = 30

export function loadConversations<TMessage>(): StoredConversation<TMessage>[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as StoredConversation<TMessage>[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Storage blocked (private mode) or corrupted: start with an empty history.
    return []
  }
}

export function saveConversations<TMessage>(conversations: StoredConversation<TMessage>[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)))
  } catch {
    // Quota exceeded or storage blocked: history just won't persist.
  }
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
