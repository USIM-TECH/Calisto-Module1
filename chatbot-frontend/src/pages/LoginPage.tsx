import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import calistoLogo from '../../calisto.svg'
import Button from '../components/Button'
import { isAuthenticated, setAdminToken } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated()) {
    return <Navigate to="/leads" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const trimmed = token.trim()
      if (!trimmed) {
        throw new Error('Admin token is required')
      }

      const res = await fetch('/reports/leads', {
        headers: { Authorization: `Bearer ${trimmed}` },
      })

      if (res.status === 401) {
        throw new Error('Invalid admin token')
      }
      if (!res.ok) {
        throw new Error(`Login failed (${res.status})`)
      }

      setAdminToken(trimmed)
      navigate('/leads', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-calisto-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-calisto-line bg-calisto-surface p-8 shadow-dashboard">
        <div className="mb-8 flex justify-center">
          <img className="h-8 w-auto" src={calistoLogo} alt="Calisto" />
        </div>
        <h1 className="text-center text-xl font-bold text-calisto-ink">Admin sign in</h1>
        <p className="mt-2 text-center text-sm leading-6 text-calisto-body">
          Enter the <code className="text-xs">ADMIN_API_TOKEN</code> from chatbot-integrations.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">Admin API token</span>
            <input
              className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-4 text-sm text-calisto-ink outline-none ring-calisto-accent focus:ring-2"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="current-password"
              placeholder="Paste ADMIN_API_TOKEN"
            />
          </label>

          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          )}

          <Button className="w-full" type="submit" variant="primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
