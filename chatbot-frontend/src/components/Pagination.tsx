import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  pageCount: number
  /** 1-based index of the first and last visible row (0 when empty). */
  visibleStart: number
  visibleEnd: number
  totalCount: number
  onPreviousPage: () => void
  onNextPage: () => void
}

const navButtonClass =
  'inline-flex h-9 items-center gap-1 rounded-lg border border-calisto-line bg-calisto-surface px-3 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted disabled:cursor-not-allowed disabled:opacity-50'

/** Table footer: "Showing 1-5 of 12" with Prev / Page x of y / Next. */
export default function Pagination({
  currentPage,
  pageCount,
  visibleStart,
  visibleEnd,
  totalCount,
  onPreviousPage,
  onNextPage,
}: PaginationProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-calisto-line-subtle px-5 py-4 text-sm text-calisto-muted sm:flex-row sm:items-center sm:justify-between">
      <span className="font-semibold">
        Showing {visibleStart}-{visibleEnd} of {totalCount}
      </span>
      <div className="flex items-center gap-2">
        <button className={navButtonClass} disabled={currentPage === 1} onClick={onPreviousPage} type="button">
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <span className="min-w-24 text-center text-sm font-semibold text-calisto-body">
          Page {currentPage} of {pageCount}
        </span>
        <button className={navButtonClass} disabled={currentPage === pageCount} onClick={onNextPage} type="button">
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
