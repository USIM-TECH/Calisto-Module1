import { FormEvent, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import calistoLogo from '../../calisto.svg'
import Button from '../components/Button'
import { useSnackbar } from '../components/Snackbar'
import { fetchCurrentUser, login } from '../lib/auth'

function safeRedirectTarget(from: string | null): string {
  // Only allow same-app paths, never an absolute or protocol-relative URL.
  if (from && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login')) {
    return from
  }
  return '/leads'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const redirectTo = safeRedirectTarget(searchParams.get('from'))
  const reason = searchParams.get('reason')
  const snackbar = useSnackbar()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Show the notice once, then drop `reason` from the URL so a refresh doesn't
  // repeat it. The ref guards against StrictMode running effects twice in dev.
  const reasonShown = useRef(false)
  useEffect(() => {
    if (!reason || reasonShown.current) return
    reasonShown.current = true
    if (reason === 'expired') {
      snackbar.info('Your session has expired. Please log in again.')
    } else if (reason === 'logged_out') {
      snackbar.success('You have been logged out.')
    }
    setSearchParams(
      (params) => {
        params.delete('reason')
        return params
      },
      { replace: true },
    )
  }, [reason, snackbar, setSearchParams])

  useEffect(() => {
    let cancelled = false
    fetchCurrentUser()
      .then((user) => {
        if (user && !cancelled) navigate(redirectTo, { replace: true })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [navigate, redirectTo])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!email.trim() || !password) {
      snackbar.error('Email and password are required.')
      return
    }

    setLoading(true)
    try {
      const user = await login(email.trim(), password)
      snackbar.success(`Welcome back, ${user.name || user.email}!`)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setPassword('')
      snackbar.error(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-calisto-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-calisto-line bg-calisto-surface p-8 shadow-dashboard">
        <div className="mb-8 flex justify-center">
          {/* The logo artwork is white; brightness-0 renders it dark on the white card. */}
          <img className="h-10 w-auto brightness-0" src={calistoLogo} alt="Calisto" />
        </div>
        <h1 className="text-center text-xl font-bold text-calisto-ink">Log In</h1>
        <p className="mt-2 text-center text-sm leading-6 text-calisto-body">
          Sign in with your Calisto admin account.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">Email</span>
            <input
              className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-4 text-sm text-calisto-ink outline-none ring-calisto-accent focus:ring-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">Password</span>
            <div className="relative">
              <input
                className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface pl-4 pr-11 text-sm text-calisto-ink outline-none ring-calisto-accent focus:ring-2"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-calisto-body transition hover:text-calisto-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.8} /> : <Eye className="h-5 w-5" strokeWidth={1.8} />}
              </button>
            </div>
          </label>

          <Button className="w-full" type="submit" variant="primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
