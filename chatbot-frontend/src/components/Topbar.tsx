import type { ReactNode } from 'react'

interface TopbarProps {
  actions?: ReactNode
  title: string
}

export default function Topbar({ actions, title }: TopbarProps) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-bold tracking-normal text-calisto-ink sm:text-3xl">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}
