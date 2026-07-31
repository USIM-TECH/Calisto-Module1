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
      ? 'rounded-bl-md bg-calisto-table text-calisto-body'
      : 'rounded-tl-md bg-calisto-line text-calisto-ink'

  return (
    <div className={`flex flex-col gap-2 ${isCustomer ? 'items-end' : 'items-start'}`}>
      <div
        className={[
          'max-w-[78%] whitespace-pre-wrap rounded-2xl px-5 py-4 text-sm font-medium leading-6 shadow-sm',
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
          <div className={`${content ? 'mt-4 ' : ''}flex flex-wrap gap-2`}>
            {payload.options.map((option) => (
              <button
                className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-xs font-bold text-calisto-ink transition hover:bg-calisto-surface-muted"
                key={option.value}
                onClick={() => onPostback(option.value, option.label)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {payload?.type === 'card' && (
          <div className={`${content ? 'mt-3 ' : ''}grid gap-2`}>
            <div className="overflow-hidden rounded-2xl border border-calisto-line bg-gradient-to-b from-calisto-surface to-calisto-surface-muted p-3 text-calisto-ink">
              {payload.imageUrl && (
                <img
                  alt={payload.title}
                  className="-mx-3 -mt-3 mb-3 max-h-56 w-[calc(100%+1.5rem)] object-cover"
                  src={cardImageUrl(payload.imageUrl)}
                />
              )}
              {!content && <div className="mb-1 text-sm font-extrabold">{payload.title}</div>}
              {payload.subtitle && (
                <div className="whitespace-pre-line text-xs leading-5 text-calisto-body">{payload.subtitle}</div>
              )}
              {payload.actions && payload.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {payload.actions.map((action) =>
                    action.type === 'url' ? (
                      <a
                        className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-xs font-bold text-calisto-ink transition hover:bg-calisto-surface-muted"
                        href={action.value}
                        key={action.value}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {action.title}
                      </a>
                    ) : (
                      <button
                        className="rounded-full border border-calisto-line bg-calisto-surface px-3 py-2 text-xs font-bold text-calisto-ink transition hover:bg-calisto-surface-muted"
                        key={action.value}
                        onClick={() => onPostback(action.value, action.title)}
                        type="button"
                      >
                        {action.title}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <span className="text-xs font-semibold text-calisto-soft">
        {isCustomer ? customerLabel : assistantLabel} - {timestamp}
      </span>
    </div>
  )
}
