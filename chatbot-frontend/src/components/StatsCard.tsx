import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  icon: LucideIcon
  label: string
  trend: string
  trendTone?: 'positive' | 'negative'
  value: string | number
}

export default function StatsCard({ icon: Icon, label, trend, trendTone = 'positive', value }: StatsCardProps) {
  const trendClass = trendTone === 'positive'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-orange-100 text-orange-700'

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-6 shadow-dashboard">
      <div className="mb-5 flex items-start justify-between gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${trendClass}`}>{trend}</span>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold leading-none text-indigo-900">{value}</div>
    </article>
  )
}
