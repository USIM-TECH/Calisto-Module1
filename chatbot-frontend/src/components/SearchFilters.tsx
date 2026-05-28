import { Search, X } from 'lucide-react'
import Button from './Button'

interface FilterOption {
  label: string
  value: string
}

interface SearchFiltersProps {
  channel: string
  channels: FilterOption[]
  onChannelChange: (value: string) => void
  onClear: () => void
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  search: string
  status: string
  statuses: FilterOption[]
}

export default function SearchFilters({
  channel,
  channels,
  onChannelChange,
  onClear,
  onSearchChange,
  onStatusChange,
  search,
  status,
  statuses,
}: SearchFiltersProps) {
  return (
    <section className="mb-5 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            className="h-11 w-full rounded-lg border border-transparent bg-slate-100 pl-10 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-200 focus:bg-white focus:ring-4 focus:ring-orange-100"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search customers..."
            type="search"
            value={search}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <select
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
            onChange={(event) => onChannelChange(event.target.value)}
            value={channel}
          >
            <option value="">All Channels</option>
            {channels.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
            onChange={(event) => onStatusChange(event.target.value)}
            value={status}
          >
            <option value="">All Statuses</option>
            {statuses.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <Button className="px-3" icon={<X className="h-4 w-4" />} onClick={onClear} variant="ghost">
            Clear
          </Button>
        </div>
      </div>
    </section>
  )
}
