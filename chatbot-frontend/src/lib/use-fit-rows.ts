import { useLayoutEffect, useState, type RefObject } from 'react'

// Rows per page below desktop width, where the page scrolls instead of filling the screen.
const MOBILE_PAGE_SIZE = 10
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Rows that fit in a table body that fills the rest of the screen (desktop),
 * recomputed on resize, so list pages never scroll; a fixed size on small screens.
 *
 * @param bodyRef   element wrapping the <table>, stretched with flex-1
 * @param headerRef the table's <thead> (its height is subtracted)
 * @param rowHeight fixed height of one row in px
 * @param ready     false while the table isn't rendered (e.g. loading skeleton)
 */
export function useFitRows(
  bodyRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  rowHeight: number,
  ready: boolean,
): number {
  const [rows, setRows] = useState(MOBILE_PAGE_SIZE)

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const desktop = window.matchMedia(DESKTOP_QUERY)
    const measure = () => {
      if (!desktop.matches) {
        setRows(MOBILE_PAGE_SIZE)
        return
      }
      const available = body.clientHeight - (headerRef.current?.offsetHeight ?? 0)
      setRows(Math.max(1, Math.floor(available / rowHeight)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    desktop.addEventListener('change', measure)
    return () => {
      observer.disconnect()
      desktop.removeEventListener('change', measure)
    }
  }, [bodyRef, headerRef, rowHeight, ready])

  return rows
}

/** Page number kept in the URL (`?page=`), clamped to the available pages. */
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
