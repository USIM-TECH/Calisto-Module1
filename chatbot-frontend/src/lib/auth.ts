// Dashboard auth is a server-side session held in an HttpOnly cookie, so the
// browser never sees a token. These helpers only talk to the /auth endpoints.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export interface AdminUser {
  id: string
  email: string
  name: string | null
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? fallback
  } catch {
    return fallback
  }
}

/** Returns the signed-in user, or null when there is no valid session. */
export async function fetchCurrentUser(): Promise<AdminUser | null> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(await readError(res, `Session check failed (${res.status})`))
  const data = (await res.json()) as { user: AdminUser }
  return data.user
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await readError(res, `Login failed (${res.status})`))
  const data = (await res.json()) as { user: AdminUser }
  return data.user
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined)
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) throw new Error(await readError(res, `Password change failed (${res.status})`))
}

export type LoginRedirectReason = 'expired' | 'logged_out'

/** Send the user to the login page, remembering where they were. */
export function redirectToLogin(reason?: LoginRedirectReason): void {
  if (window.location.pathname === '/login') return
  const params = new URLSearchParams({ from: `${window.location.pathname}${window.location.search}` })
  if (reason) params.set('reason', reason)
  window.location.assign(`/login?${params.toString()}`)
}
