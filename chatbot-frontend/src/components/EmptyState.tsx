import dataNotFoundIcon from '../assets/data-not-found.svg'

/**
 * Placeholder for an empty table. Rendered after the <table> inside a flex-col
 * body, it fills and centres in the space the rows would take.
 *
 * The icon file has a hard-coded colour, so it is used as a CSS mask and painted
 * with the theme accent instead (swapping the SVG keeps the colour in sync).
 */
export default function EmptyState() {
  const mask = `url("${dataNotFoundIcon}") center / contain no-repeat`

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center" role="status">
      <span
        aria-hidden="true"
        className="block h-24 w-24 bg-calisto-accent opacity-50"
        style={{ mask, WebkitMask: mask }}
      />
      <p className="text-base font-medium text-calisto-muted opacity-80">No Data Found</p>
    </div>
  )
}
