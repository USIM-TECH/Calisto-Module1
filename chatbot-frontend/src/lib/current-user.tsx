import { createContext, useContext } from 'react'
import type { AdminUser } from './auth'

// Populated by RequireAuth once /auth/me succeeds, so pages inside the dashboard
// can read the signed-in admin without another request.
export const CurrentUserContext = createContext<AdminUser | null>(null)

export function useCurrentUser(): AdminUser {
  const user = useContext(CurrentUserContext)
  if (!user) {
    throw new Error('useCurrentUser must be used inside RequireAuth')
  }
  return user
}

export function displayName(user: AdminUser): string {
  return user.name?.trim() || user.email
}
