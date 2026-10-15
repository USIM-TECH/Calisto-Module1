import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject, type UIEvent } from 'react'

/** Rows per page the user can pick in a table footer. */
export type PageSize = 10 | 50 | 100

export const PAGE_SIZE_OPTIONS: PageSize[] = [10, 50, 100]

const DEFAULT_PAGE_SIZE: PageSize = 10

// How long the scrollbar stays visible after the last scroll.
const SCROLLBAR_HIDE_DELAY_MS = 900

// One preference shared by every table, remembered across visits.
const PAGE_SIZE_STORAGE_KEY = 'calisto.table-page-size'

function readPageSize(): PageSize {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    const match = PAGE_SIZE_OPTIONS.find((option) => option === stored)
    if (match) return match
  } catch {
    // Storage can be unavailable (private mode); use the default.
  }
  return DEFAULT_PAGE_SIZE
}

/**
 * Rows per page for a list table, chosen in the pagination footer (10, 50 or 100).
 * A page can be taller than the screen, so the table body scrolls inside its card.
 *
 * - Spread `pagination` onto <Pagination>.
 * - Give the table's scroll wrapper `className="table-scroll ... lg:overflow-y-auto"`
 *   and spread `scrollProps` on it. That starts its scrollbar below the column header
 *   instead of beside it, and shows the scrollbar only while the table is scrolling.
 * - Make the <thead> sticky (`sticky top-0 z-10` plus an opaque background).
 *
 * @param headerRef the table's <thead>, measured so the scrollbar can start below it
 * @param ready     false while the table isn't rendered (e.g. loading skeleton)
 */
export function useTablePaging(headerRef: RefObject<HTMLElement | null>, ready: boolean) {
  const [pageSize, setPageSizeState] = useState<PageSize>(readPageSize)
  const [headerHeight, setHeaderHeight] = useState(0)
  const hideTimer = useRef<number>()

  const onPageSizeChange = useCallback((next: PageSize) => {
    setPageSizeState(next)
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next))
    } catch {
      // Not persisted; still applies for this visit.
    }
  }, [])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  // The scrollbar is transparent until [data-scrolling] is set (see .table-scroll in styles.css).
  // Toggling the attribute directly avoids re-rendering the table on every scroll event.
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget
    element.dataset.scrolling = ''
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => { delete element.dataset.scrolling }, SCROLLBAR_HIDE_DELAY_MS)
  }, [])

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const measure = () => setHeaderHeight(header.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [headerRef, ready])

  return {
    rowsPerPage: pageSize,
    scrollProps: { style: { '--table-head-h': `${headerHeight}px` } as CSSProperties, onScroll },
    pagination: { pageSize, onPageSizeChange },
  }
}

/** Slices `items` to the requested page, clamping the page to the pages that exist. */
export function pageSlice<T>(items: T[], rowsPerPage: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / rowsPerPage))
  const currentPage = Math.min(pageCount, Math.max(1, requestedPage || 1))
  const pageStart = (currentPage - 1) * rowsPerPage
  const pageItems = items.slice(pageStart, pageStart + rowsPerPage)
  return {
    pageCount,
    currentPage,
    pageItems,
    visibleStart: pageItems.length ? pageStart + 1 : 0,
    visibleEnd: pageStart + pageItems.length,
  }
}
