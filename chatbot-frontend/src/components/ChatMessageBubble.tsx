import { ArrowUpRight } from 'lucide-react'
import type { OutgoingMessage } from '../types'
import { cardImageUrl } from '../lib/chat'

interface ChatMessageBubbleProps {
  assistantLabel?: string
  content: string
  customerLabel?: string
  direction: 'customer' | 'assistant'
  onPostback: (value: string, label?: string) => void
  payload?: OutgoingMessage
  timestamp: string
  variant?: 'chatbot' | 'console'
}

export default function ChatMessageBubble({
  assistantLabel = 'Calisto Assistant',
  content,
  customerLabel = 'You',
  direction,
  onPostback,
  payload,
  timestamp,
  variant = 'chatbot',
}: ChatMessageBubbleProps) {
  const isCustomer = direction === 'customer'
  const customerBubble =
    variant === 'chatbot'
      ? 'rounded-br-md bg-calisto-sidebar text-calisto-surface'
      : 'rounded-tr-md bg-blue-600 text-calisto-surface'
  const assistantBubble =
    variant === 'chatbot'
      ? 'text-calisto-body'
      : 'rounded-tl-md bg-calisto-line text-calisto-ink'
  // Chatbot (Claude-style layout): assistant replies are plain text across the
  // column, only the user's messages sit in a bubble, and there is no meta line.
  const bubbleShape = variant === 'chatbot' && !isCustomer
    ? 'w-full'
    : 'max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%]'

  return (
    <div className={`flex flex-col gap-1.5 ${isCustomer ? 'items-end' : 'items-start'}`}>
      {payload?.type === 'card' ? (
        <CardMessage card={payload} onPostback={onPostback} />
      ) : (
        <div
          className={[
            'whitespace-pre-wrap break-words text-sm leading-6',
            bubbleShape,
            isCustomer ? customerBubble : assistantBubble,
          ].join(' ')}
        >
          {content && <div>{content}</div>}

          {payload?.type === 'image' && (
            <img
              alt={payload.caption ?? 'Assistant image'}
              className={`${content ? 'mt-3 ' : ''}max-h-56 w-full rounded-xl object-cover`}
              src={cardImageUrl(payload.imageUrl)}
            />
          )}

          {payload?.type === 'choice' && (
            <div className={`${content ? 'mt-3 ' : ''}flex flex-wrap gap-2`}>
              {payload.options.map((option) => (
                <button
                  className="rounded-full border border-calisto-line bg-calisto-surface px-3.5 py-1.5 text-sm font-medium text-calisto-ink transition hover:border-calisto-accent/40 hover:bg-calisto-surface-muted"
                  key={option.value}
                  onClick={() => onPostback(option.value, option.label)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {variant !== 'chatbot' && (
        <span className="px-1 text-xs text-calisto-soft">
          {isCustomer ? customerLabel : assistantLabel} · {timestamp}
        </span>
      )}
    </div>
  )
}

type CardPayload = Extract<OutgoingMessage, { type: 'card' }>

const cardActionClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40'

type AppStore = 'apple' | 'google'

function appStoreFor(url: string): AppStore | undefined {
  try {
    const host = new URL(url).hostname
    if (host === 'apps.apple.com' || host === 'itunes.apple.com') return 'apple'
    if (host === 'play.google.com') return 'google'
  } catch {
    // Not an absolute URL; render as a normal link.
  }
  return undefined
}

// Monochrome store marks (Simple Icons, CC0).
const storeBadges: Record<AppStore, { caption: string; name: string; path: string }> = {
  apple: {
    caption: 'Download on the',
    name: 'App Store',
    path: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
  },
  google: {
    caption: 'Get it on',
    name: 'Google Play',
    path: 'M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z',
  },
}

function StoreBadge({ store, href }: { store: AppStore; href: string }) {
  const badge = storeBadges[store]
  return (
    <a
      aria-label={`${badge.caption} ${badge.name}`}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-black px-3.5 text-white transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <svg aria-hidden="true" className="h-5 w-5 shrink-0 fill-current" viewBox="0 0 24 24">
        <path d={badge.path} />
      </svg>
      <span className="flex flex-col text-left leading-none">
        <span className="text-[0.625rem] font-medium uppercase tracking-wide">{badge.caption}</span>
        <span className="mt-0.5 text-[0.9375rem] font-semibold">{badge.name}</span>
      </span>
    </a>
  )
}

/** Standalone card (not nested in a bubble): optional image, title, description, actions. */
function CardMessage({ card, onPostback }: { card: CardPayload; onPostback: (value: string, label?: string) => void }) {
  return (
    <div className="w-full max-w-[88%] overflow-hidden rounded-2xl rounded-bl-md border border-calisto-line bg-calisto-surface shadow-sm sm:max-w-sm">
      {card.imageUrl && (
        <img alt={card.title} className="max-h-56 w-full border-b border-calisto-line-subtle object-cover" src={cardImageUrl(card.imageUrl)} />
      )}
      <div className="px-4 py-3.5">
        <div className="text-sm font-semibold leading-6 text-calisto-ink">{card.title}</div>
        {card.subtitle && (
          <div className="mt-1 whitespace-pre-line text-sm leading-6 text-calisto-body">{card.subtitle}</div>
        )}
      </div>
      {card.actions && card.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-calisto-line-subtle bg-calisto-surface-muted px-4 py-3">
          {card.actions.map((action, index) => {
            const store = action.type === 'url' ? appStoreFor(action.value) : undefined
            if (store) {
              return <StoreBadge href={action.value} key={action.value} store={store} />
            }
            // The first action is the main call to action; the rest are secondary.
            const tone = index === 0
              ? 'bg-calisto-accent text-calisto-surface hover:bg-calisto-accent/90'
              : 'border border-calisto-line bg-calisto-surface text-calisto-ink hover:bg-calisto-surface-muted'
            return action.type === 'url' ? (
              <a
                className={`${cardActionClass} ${tone}`}
                href={action.value}
                key={action.value}
                rel="noreferrer"
                target="_blank"
              >
                {action.title}
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </a>
            ) : (
              <button
                className={`${cardActionClass} ${tone}`}
                key={action.value}
                onClick={() => onPostback(action.value, action.title)}
                type="button"
              >
                {action.title}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
