import { ChevronLeft, ChevronRight } from 'lucide-react'
import Select from './Select'
import { PAGE_SIZE_OPTIONS, type PageSize } from '../lib/table-paging'

interface PaginationProps {
  currentPage: number
  pageCount: number
  /** 1-based index of the first and last visible row (0 when empty). */
  visibleStart: number
  visibleEnd: number
  totalCount: number
  onPreviousPage: () => void
  onNextPage: () => void
  /** With both set, the footer offers a rows-per-page choice. */
  pageSize?: PageSize
  onPageSizeChange?: (size: PageSize) => void
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
  pageSize,
  onPageSizeChange,
}: PaginationProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-calisto-line-subtle px-5 py-4 text-sm text-calisto-muted sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-semibold">
          Showing {visibleStart}-{visibleEnd} of {totalCount}
        </span>
        {pageSize !== undefined && onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap">Rows per page</span>
            <Select
              aria-label="Rows per page"
              className="!h-9 !rounded-lg !px-3 !text-sm"
              onChange={(value) => {
                const next = PAGE_SIZE_OPTIONS.find((option) => String(option) === value)
                if (next) onPageSizeChange(next)
              }}
              options={PAGE_SIZE_OPTIONS.map((option) => ({ value: String(option), label: String(option) }))}
              value={String(pageSize)}
            />
          </label>
        )}
      </div>
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
