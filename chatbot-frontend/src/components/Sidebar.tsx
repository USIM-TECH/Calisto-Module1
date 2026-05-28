import { BookOpen, Boxes, LogOut, MessageSquareText, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const items = [
  { label: 'Leads', to: '/leads', icon: UsersRound },
  { label: 'Products', to: '/products', icon: Boxes },
  { label: 'Knowledge', to: '/knowledge', icon: BookOpen },
  { label: 'Webchat', to: '/webchat', icon: MessageSquareText },
]

export default function Sidebar() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-calisto-sidebar px-4 py-8 text-white lg:flex">
        <div className="mb-12 px-5">
          <div className="font-serif text-2xl tracking-[0.22em] text-white">CALISTO</div>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {items.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold uppercase tracking-wide transition',
                  isActive ? 'bg-calisto-sidebarActive text-white shadow-sm' : 'text-slate-100/90 hover:bg-white/10',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="mt-8 flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <LogOut className="h-5 w-5" strokeWidth={1.8} />
          Log out
        </button>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/15 bg-calisto-sidebar px-4 py-3 text-white lg:hidden">
        <div className="mb-3 font-serif text-lg tracking-[0.22em]">CALISTO</div>
        <nav className="grid grid-cols-4 gap-2">
          {items.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center justify-center rounded-xl text-xs font-semibold transition',
                  isActive ? 'bg-calisto-sidebarActive text-white' : 'text-slate-100/90 hover:bg-white/10',
                ].join(' ')
              }
              title={label}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            </NavLink>
          ))}
        </nav>
      </header>
    </>
  )
}
