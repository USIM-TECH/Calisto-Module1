import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

// Material-style "⋯" row menu (IconButton + Menu). Rendered in a portal so a
// table's overflow can't clip it; follows the ARIA menu-button pattern.

export interface ActionMenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger' | 'primary'
  disabled?: boolean
}

interface ActionMenuProps {
  items: ActionMenuItem[]
  /** Accessible name for the trigger, e.g. "Actions for Calisto Bot". */
  label: string
  disabled?: boolean
}

const MENU_GAP = 6
const MENU_WIDTH = 208

const toneClass: Record<NonNullable<ActionMenuItem['tone']>, string> = {
  default: 'text-calisto-ink',
  danger: 'text-rose-600',
  primary: 'text-calisto-accent',
}

export default function ActionMenu({ items, label, disabled = false }: ActionMenuProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuHeight = items.length * 40 + 12
    const openUp = window.innerHeight - rect.bottom < menuHeight + MENU_GAP + 8 && rect.top > menuHeight
    // Right-align the menu with the button, like MUI's anchorOrigin right.
    setPosition({
      right: window.innerWidth - rect.right,
      ...(openUp ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
    })
  }, [items.length])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }, [])

  function focusItem(index: number) {
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    if (!buttons?.length) return
    buttons[(index + buttons.length) % buttons.length]?.focus()
  }

  function toggle() {
    if (open) {
      close()
      return
    }
    updatePosition()
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    focusItem(0)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, close])

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusItem(current + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem(current - 1)
        break
      case 'Home':
        event.preventDefault()
        focusItem(0)
        break
      case 'End':
        event.preventDefault()
        focusItem(buttons.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={[
          'inline-flex h-9 w-9 items-center justify-center rounded-lg text-calisto-body transition',
          'hover:bg-calisto-table hover:text-calisto-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'bg-calisto-table text-calisto-ink' : '',
        ].join(' ')}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            toggle()
          }
        }}
        ref={buttonRef}
        title="Actions"
        type="button"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && position && createPortal(
        <div
          aria-label={label}
          className="select-menu-enter fixed z-[70] rounded-xl border border-calisto-line bg-calisto-surface py-1.5 shadow-[0_10px_30px_rgba(31,41,55,0.14)]"
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
          style={{
            right: position.right,
            top: position.top,
            bottom: position.bottom,
            width: MENU_WIDTH,
            transformOrigin: position.bottom !== undefined ? 'bottom right' : 'top right',
          }}
        >
          {items.map((item) => (
            <button
              className={[
                'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm font-medium outline-none transition',
                'hover:bg-calisto-table focus-visible:bg-calisto-table disabled:cursor-not-allowed disabled:opacity-50',
                toneClass[item.tone ?? 'default'],
              ].join(' ')}
              disabled={item.disabled}
              key={item.label}
              onClick={() => {
                close()
                item.onSelect()
              }}
              role="menuitem"
              tabIndex={-1}
              type="button"
            >
              {item.icon && <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
