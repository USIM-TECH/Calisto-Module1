import { lazy, Suspense, useState } from 'react'
import { BookOpen, Boxes, LogOut, MessageSquareText, Radio, Sparkles, UsersRound } from 'lucide-react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
const WebchatPage = lazy(() => import('./pages/WebchatPage'))
const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const PresetsPage = lazy(() => import('./pages/PresetsPage'))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'))
const ChannelsPage = lazy(() => import('./pages/ChannelsPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'))
const ChatbotPage = lazy(() => import('./pages/ChatbotPage'))
import { clearAdminToken, isAuthenticated } from './lib/auth'
import calistoLogo from '../calisto.svg'

const navItems = [
  { label: 'Leads', to: '/leads', icon: UsersRound },
  { label: 'Channels', to: '/channels', icon: Radio },
  { label: 'Products', to: '/products', icon: Boxes },
  { label: 'Presets', to: '/presets', icon: Sparkles },
  { label: 'Documents', to: '/knowledge', icon: BookOpen },
  { label: 'Webchat', to: '/webchat', icon: MessageSquareText },
]

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

export default function App() {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const location = useLocation()

  if (location.pathname === '/chatbot') {
    return (
      <div className="min-h-screen bg-calisto-canvas text-calisto-ink">
        <Suspense>
          <Routes>
            <Route path="/chatbot" element={<ChatbotPage />} />
          </Routes>
        </Suspense>
      </div>
    )
  }

  if (location.pathname === '/login') {
    return (
      <div className="min-h-screen bg-calisto-canvas text-calisto-ink">
        <Suspense>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Suspense>
      </div>
    )
  }

  return (
    <RequireAuth>
      <div className="min-h-screen bg-calisto-canvas text-calisto-ink">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-calisto-sidebar px-4 py-8 text-calisto-surface lg:flex">
          <div className="mb-12 px-5">
            <img className="h-8 w-auto brightness-0 invert" src={calistoLogo} alt="Calisto" />
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
            className="mt-8 flex h-11 items-center justify-center gap-3 rounded-xl px-4 text-sm font-semibold text-calisto-surface transition hover:bg-calisto-surface/10"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut className="h-5 w-5" strokeWidth={1.8} />
            Log out
          </button>
        </aside>

        <header className="sticky top-0 z-30 border-b border-calisto-surface/15 bg-calisto-sidebar px-4 py-3 text-calisto-surface lg:hidden">
          <img className="mb-3 h-6 w-auto brightness-0 invert" src={calistoLogo} alt="Calisto" />
          <nav className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
          <Suspense>
            <Routes>
              <Route path="/" element={<Navigate to="/leads" replace />} />
              <Route path="/webchat" element={<WebchatPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/:customerId" element={<LeadDetailPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/presets" element={<PresetsPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>

        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
            <div
              aria-labelledby="logoutConfirmTitle"
              aria-modal="true"
              className="w-full max-w-md overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface text-calisto-ink shadow-dashboard"
              role="dialog"
            >
              <div className="border-b border-calisto-line px-6 py-5">
                <h2 id="logoutConfirmTitle" className="text-lg font-bold text-calisto-ink">Log out?</h2>
                <p className="mt-2 text-sm leading-6 text-calisto-body">
                  Are you sure you want to log out of Calisto?
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-3 px-6 py-5">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface px-4 text-sm font-semibold text-calisto-ink transition hover:bg-calisto-surface-muted"
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-calisto-accent bg-calisto-accent px-4 text-sm font-semibold text-calisto-surface shadow-sm transition hover:bg-calisto-accent/90"
                  type="button"
                  onClick={() => {
                    clearAdminToken()
                    setShowLogoutConfirm(false)
                    window.location.href = '/login'
                  }}
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireAuth>
  )
}
