import { useEffect, useId, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

// Dialog shell used by every form popup: the header (title + close) and the
// footer (action buttons) stay fixed; only the body between them scrolls.

const sizeClass = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
} as const

interface ModalProps {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  /** Action buttons, pinned to the bottom. */
  footer?: ReactNode
  /** When set, body + footer are wrapped in a <form> so a submit button in the footer works. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  size?: keyof typeof sizeClass
  /** Disable closing (overlay click / Esc / ✕) while something is saving. */
  dismissible?: boolean
  children: ReactNode
}

export default function Modal({
  title,
  description,
  onClose,
  footer,
  onSubmit,
  size = 'lg',
  dismissible = true,
  children,
}: ModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!dismissible) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dismissible, onClose])

  // While open: stop the page behind from scrolling, and return focus to
  // whatever opened the dialog when it closes.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previousFocus?.focus?.()
    }
  }, [])

  const body = <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
  const footerBar = footer && (
    <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-calisto-line px-6 py-4">{footer}</div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 p-4 sm:p-8"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard ${sizeClass[size]}`}
        role="dialog"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-calisto-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-calisto-ink" id={titleId}>{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-calisto-body">{description}</p>}
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-calisto-line text-calisto-body transition hover:bg-calisto-surface-muted hover:text-calisto-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40 disabled:opacity-50"
            disabled={!dismissible}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {onSubmit ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            {body}
            {footerBar}
          </form>
        ) : (
          <>
            {body}
            {footerBar}
          </>
        )}
      </div>
    </div>
  )
}
