interface StatusBadgeProps {
  status: string
}

const tones: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 ring-blue-200',
  needs_review: 'bg-amber-50 text-amber-700 ring-amber-200',
  qualified: 'bg-violet-100 text-violet-700 ring-violet-200',
  unqualified: 'bg-rose-50 text-rose-700 ring-rose-200',
  converted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  synced: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-slate-100 text-slate-600 ring-slate-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function labelFor(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${tones[status] ?? tones.pending}`}>
      {labelFor(status)}
    </span>
  )
}
