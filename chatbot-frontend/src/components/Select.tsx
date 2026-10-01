import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

// Material-style select: a button that opens a floating menu (rendered in a
// portal so dialogs with scrolling/overflow can't clip it). Follows the ARIA
// combobox + listbox pattern: focus stays on the button and the highlighted
// option is exposed via aria-activedescendant.

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Shown (greyed) when value is '' and offered as the first menu item to clear the field. */
  placeholder?: string
  id?: string
  'aria-label'?: string
  /** Stretch to the container instead of sizing to the longest option. */
  fullWidth?: boolean
  disabled?: boolean
  className?: string
}

const MENU_GAP = 6
const MENU_MAX_HEIGHT = 288

interface MenuPosition {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  id,
  'aria-label': ariaLabel,
  fullWidth = false,
  disabled = false,
  className = '',
}: SelectProps) {
  const listboxId = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const typeahead = useRef({ text: '', timer: 0 })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const items: SelectOption[] = placeholder ? [{ value: '', label: placeholder }, ...options] : options
  const selectedIndex = items.findIndex((item) => item.value === value)
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined
  const showingPlaceholder = Boolean(placeholder) && value === ''

  const updatePosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - 8
    const spaceAbove = rect.top - MENU_GAP - 8
    // Open upwards (like MUI) when there isn't room below but there is above.
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow
    setPosition({
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
      maxHeight: Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
    })
  }, [])

  const openMenu = useCallback((highlight?: number) => {
    if (disabled) return
    updatePosition()
    setActiveIndex(highlight ?? Math.max(0, selectedIndex))
    setOpen(true)
  }, [disabled, selectedIndex, updatePosition])

  const closeMenu = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }, [])

  function choose(index: number) {
    const item = items[index]
    if (!item) return
    if (item.value !== value) onChange(item.value)
    closeMenu()
  }

  // Keep the menu attached to the button while the page or a dialog scrolls.
  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  // Close on a click outside the button and the menu.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return
      closeMenu(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, closeMenu])

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function jumpToTyped(key: string) {
    const state = typeahead.current
    window.clearTimeout(state.timer)
    state.text += key.toLowerCase()
    state.timer = window.setTimeout(() => { state.text = '' }, 600)
    const start = open ? activeIndex + 1 : selectedIndex + 1
    const ordered = [...items.slice(start), ...items.slice(0, start)]
    const match = ordered.find((item) => item.label.toLowerCase().startsWith(state.text))
    if (!match) return
    const index = items.indexOf(match)
    if (open) setActiveIndex(index)
    else if (match.value !== value) onChange(match.value)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const last = items.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) openMenu()
        else setActiveIndex((index) => Math.min(last, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openMenu()
        else setActiveIndex((index) => Math.max(0, index - 1))
        break
      case 'Home':
        if (open) { event.preventDefault(); setActiveIndex(0) }
        break
      case 'End':
        if (open) { event.preventDefault(); setActiveIndex(last) }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) choose(activeIndex)
        else openMenu()
        break
      case 'Escape':
        if (open) { event.preventDefault(); closeMenu() }
        break
      case 'Tab':
        if (open) closeMenu(false)
        break
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          jumpToTyped(event.key)
        }
    }
  }

  return (
    <>
      <button
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={[
          'inline-flex h-11 items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm font-medium outline-none transition',
          'focus-visible:border-calisto-accent/50 focus-visible:ring-4 focus-visible:ring-calisto-focus disabled:cursor-not-allowed disabled:opacity-60',
          open ? 'border-calisto-accent/50 ring-4 ring-calisto-focus' : 'border-calisto-line hover:border-calisto-soft',
          'bg-calisto-surface',
          fullWidth ? 'w-full' : '',
          className,
        ].join(' ')}
        disabled={disabled}
        id={id}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        ref={buttonRef}
        role="combobox"
        type="button"
      >
        {/* Every label sits in the same grid cell (only the current one visible),
            so the button is as wide as the longest option and doesn't jump. */}
        <span className="grid min-w-0">
          {!fullWidth && items.map((item) => (
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap" key={item.value}>
              {item.label}
            </span>
          ))}
          <span className={`col-start-1 row-start-1 truncate ${showingPlaceholder ? 'text-calisto-soft' : 'text-calisto-body'}`}>
            {selected?.label ?? placeholder ?? ''}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-calisto-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && position && createPortal(
        <ul
          className="select-menu-enter fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-calisto-line bg-calisto-surface py-1.5 shadow-[0_10px_30px_rgba(31,41,55,0.14)]"
          id={listboxId}
          ref={listRef}
          role="listbox"
          style={{
            left: position.left,
            minWidth: position.width,
            top: position.top,
            bottom: position.bottom,
            maxHeight: position.maxHeight,
            transformOrigin: position.bottom !== undefined ? 'bottom' : 'top',
          }}
        >
          {items.map((item, index) => {
            const isPlaceholder = Boolean(placeholder) && index === 0
            // The placeholder is "nothing chosen", so it never looks selected.
            const isSelected = index === selectedIndex && !isPlaceholder
            const isActive = index === activeIndex
            return (
              <li
                aria-selected={index === selectedIndex}
                className={[
                  'flex cursor-pointer select-none items-center justify-between gap-6 px-3.5 py-2.5 text-sm',
                  isSelected
                    ? `font-semibold text-calisto-accent ${isActive ? 'bg-calisto-accent/[0.14]' : 'bg-calisto-accent/[0.08]'}`
                    : `${isPlaceholder ? 'text-calisto-soft' : 'text-calisto-ink'} ${isActive ? 'bg-calisto-table' : ''}`,
                ].join(' ')}
                data-index={index}
                id={`${listboxId}-${index}`}
                key={item.value}
                onClick={() => choose(index)}
                // Keep focus on the button so keyboard handling keeps working.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => { if (!isActive) setActiveIndex(index) }}
                role="option"
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {isSelected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.4} />}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
