import { BookOpen, Boxes, LogOut, MessageSquareText, UsersRound } from 'lucide-react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import WebchatPage from './pages/WebchatPage'
import LeadsPage from './pages/LeadsPage'
import ProductsPage from './pages/ProductsPage'
import KnowledgePage from './pages/KnowledgePage'
import NotFoundPage from './pages/NotFoundPage'
import LeadDetailPage from './pages/LeadDetailPage'

const navItems = [
  { label: 'Leads', to: '/leads', icon: UsersRound },
  { label: 'Products', to: '/products', icon: Boxes },
  { label: 'Knowledge', to: '/knowledge', icon: BookOpen },
  { label: 'Webchat', to: '/webchat', icon: MessageSquareText },
]

export default function App() {
  return (
    <div className="min-h-screen bg-calisto-canvas text-calisto-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-calisto-sidebar px-4 py-8 text-calisto-surface lg:flex">
        <div className="mb-12 px-5">
          <div className="font-serif text-2xl tracking-[0.22em] text-calisto-surface">CALISTO</div>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold uppercase tracking-wide transition',
                  isActive ? 'bg-calisto-sidebarActive text-calisto-surface shadow-sm' : 'text-calisto-surface/90 hover:bg-calisto-surface/10',
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
          className="mt-8 flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-calisto-surface transition hover:bg-calisto-surface/10"
        >
          <LogOut className="h-5 w-5" strokeWidth={1.8} />
          Log out
        </button>
      </aside>

      <header className="sticky top-0 z-30 border-b border-calisto-surface/15 bg-calisto-sidebar px-4 py-3 text-calisto-surface lg:hidden">
        <div className="mb-3 font-serif text-lg tracking-[0.22em]">CALISTO</div>
        <nav className="grid grid-cols-4 gap-2">
          {navItems.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center justify-center rounded-xl text-xs font-semibold transition',
                  isActive ? 'bg-calisto-sidebarActive text-calisto-surface' : 'text-calisto-surface/90 hover:bg-calisto-surface/10',
                ].join(' ')
              }
              title={label}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-h-screen lg:pl-60">
        <Routes>
          <Route path="/" element={<Navigate to="/leads" replace />} />
          <Route path="/webchat" element={<WebchatPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:customerId" element={<LeadDetailPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}

