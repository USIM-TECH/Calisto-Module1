import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

// App-wide snackbar: bottom-right on desktop (clear of the left sidebar),
// full-width bottom on mobile. Use for results of user actions ("Product saved").
// Form validation errors stay inline next to the fields instead.

type SnackbarVariant = 'success' | 'error' | 'info'

interface SnackbarAction {
  label: string
  onClick: () => void
}

interface SnackbarOptions {
  /** Milliseconds before auto-dismiss; 0 keeps it until closed. */
  duration?: number
  action?: SnackbarAction
}

interface SnackbarItem extends Required<Pick<SnackbarOptions, 'duration'>> {
  id: number
  variant: SnackbarVariant
  message: string
  action?: SnackbarAction
}

interface SnackbarApi {
  success: (message: string, options?: SnackbarOptions) => void
  error: (message: string, options?: SnackbarOptions) => void
  info: (message: string, options?: SnackbarOptions) => void
  dismiss: (id: number) => void
}

const MAX_VISIBLE = 3
const DEFAULT_DURATION: Record<SnackbarVariant, number> = {
  success: 5000,
  info: 5000,
  error: 8000,
}

const variantStyles: Record<SnackbarVariant, { icon: typeof Info; iconClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-400' },
  error: { icon: XCircle, iconClass: 'text-rose-400' },
  info: { icon: Info, iconClass: 'text-sky-300' },
}

const SnackbarContext = createContext<SnackbarApi | null>(null)

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext)
  if (!api) {
    throw new Error('useSnackbar must be used inside <SnackbarProvider>')
  }
  return api
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SnackbarItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = useCallback((variant: SnackbarVariant, message: string, options?: SnackbarOptions) => {
    const item: SnackbarItem = {
      id: nextId.current++,
      variant,
      message,
      action: options?.action,
      duration: options?.duration ?? DEFAULT_DURATION[variant],
    }
    // Newest at the bottom; drop the oldest beyond the visible limit.
    setItems((current) => [...current, item].slice(-MAX_VISIBLE))
  }, [])

  const api = useMemo<SnackbarApi>(() => ({
    success: (message, options) => show('success', message, options),
    error: (message, options) => show('error', message, options),
    info: (message, options) => show('info', message, options),
    dismiss,
  }), [show, dismiss])

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {/* Above modals (z-50) so results of actions taken inside a modal stay visible. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]"
      >
        {items.map((item) => (
          <SnackbarToast key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </SnackbarContext.Provider>
  )
}

function SnackbarToast({ item, onDismiss }: { item: SnackbarItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const remaining = useRef(item.duration)
  const { icon: Icon, iconClass } = variantStyles[item.variant]

  // Auto-dismiss timer that pauses while hovered or focused.
  useEffect(() => {
    if (item.duration === 0 || paused) return
    const startedAt = Date.now()
    const timer = window.setTimeout(() => onDismiss(item.id), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current -= Date.now() - startedAt
    }
  }, [item.id, item.duration, paused, onDismiss])

  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      className="snackbar-enter pointer-events-auto flex items-start gap-3 rounded-xl bg-calisto-ink px-4 py-3 text-sm text-white shadow-dashboard"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`} strokeWidth={1.8} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words leading-5">{item.message}</p>
      {item.action && (
        <button
          type="button"
          className="shrink-0 rounded-md px-1 font-semibold uppercase tracking-wide text-orange-300 transition hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          onClick={() => {
            item.action?.onClick()
            onDismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className="-mr-1 shrink-0 rounded-md p-0.5 text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  )
}
