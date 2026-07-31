/**
 * Skeleton – lightweight shimmer primitives.
 * All loading states across the app use these to match the real layout.
 */

/** Single shimmer block */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-calisto-table via-calisto-line-subtle to-calisto-table bg-[length:400%_100%] [animation:shimmer_1.6s_ease-in-out_infinite] ${className}`}
    />
  )
}

/** A full stats-card skeleton (matches StatsCard in LeadsPage) */
export function SkeletonStatsCard() {
  return (
    <article className="rounded-2xl border border-calisto-line-subtle bg-calisto-surface p-6 shadow-dashboard">
      <div className="mb-5 flex items-start justify-between gap-4">
        <SkeletonBlock className="h-10 w-10 !rounded-xl" />
        <SkeletonBlock className="h-6 w-14" />
      </div>
      <SkeletonBlock className="mb-3 h-3 w-28" />
      <SkeletonBlock className="h-8 w-16" />
    </article>
  )
}

/** A single table-row skeleton */
export function SkeletonTableRow({ cols = 6 }: { cols?: number }) {
  const widths = ['w-2/5', 'w-3/5', 'w-1/3', 'w-1/4', 'w-1/5', 'w-1/4', 'w-1/3', 'w-1/5']
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-7 py-4">
          <SkeletonBlock className={`h-4 ${widths[i % widths.length]}`} />
        </td>
      ))}
    </tr>
  )
}

/** Full table skeleton (header + rows) */
export function SkeletonTable({
  cols = 6,
  rows = 5,
  headers,
}: {
  cols?: number
  rows?: number
  headers?: string[]
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-calisto-table/90">
              {(headers ?? Array.from({ length: cols })).map((h, i) => (
                <th key={i} className="px-7 py-5">
                  {h ? (
                    <span className="text-xs font-bold uppercase tracking-wider text-calisto-ink opacity-40">
                      {h}
                    </span>
                  ) : (
                    <SkeletonBlock className="h-3 w-20" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-calisto-line-subtle">
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} cols={cols} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Skeleton for the search / filter bar */
export function SkeletonFilterBar() {
  return (
    <div className="mb-5 rounded-xl border border-calisto-line-subtle bg-calisto-surface p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SkeletonBlock className="h-11 flex-1" />
        <div className="flex gap-3">
          <SkeletonBlock className="h-11 w-32" />
          <SkeletonBlock className="h-11 w-28" />
          <SkeletonBlock className="h-11 w-20" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton for a LeadsPage-style topbar */
export function SkeletonTopbar() {
  return (
    <div className="mb-7 flex items-center justify-between">
      <SkeletonBlock className="h-9 w-72" />
      <SkeletonBlock className="h-10 w-24 !rounded-xl" />
    </div>
  )
}

/** Skeleton for the LeadDetailPage two-column layout */
export function SkeletonLeadDetail() {
  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* sidebar */}
      <aside className="grid gap-4">
        <div className="overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
          <div className="flex items-start gap-4 border-b border-calisto-line-subtle px-5 py-5">
            <SkeletonBlock className="h-14 w-14 !rounded-full" />
            <div className="flex-1 space-y-3">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
          </div>
          <div className="border-b border-calisto-line-subtle px-5 py-5 space-y-3">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-4 w-5/6" />
          </div>
          <div className="px-5 py-5 space-y-3">
            <SkeletonBlock className="h-3 w-16" />
            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-6 w-20" />
              <SkeletonBlock className="h-6 w-16" />
              <SkeletonBlock className="h-6 w-24" />
            </div>
          </div>
        </div>
        {/* notes */}
        <div className="overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
          <div className="border-b border-calisto-line-subtle px-5 py-4">
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <div className="px-5 py-4 space-y-2">
            <SkeletonBlock className="h-24 w-full" />
          </div>
        </div>
      </aside>

      {/* chat panel */}
      <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-calisto-line-subtle bg-calisto-surface shadow-sm">
        <div className="flex h-14 shrink-0 items-center border-b border-calisto-line-subtle px-5">
          <SkeletonBlock className="h-4 w-40" />
        </div>
        <div className="flex flex-1 flex-col gap-6 bg-calisto-table/80 px-12 py-7">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <SkeletonBlock
                className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-1/2' : 'w-2/5'}`}
              />
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-calisto-line-subtle bg-calisto-surface px-5 py-4">
          <SkeletonBlock className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

/** Webchat typing indicator (three bouncing dots) */
export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-calisto-sidebar px-4 py-3 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-calisto-surface/70"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}
