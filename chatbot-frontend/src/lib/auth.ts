const STORAGE_KEY = 'calisto_admin_token'

export function getAdminToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEY)
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token.trim())
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getAdminToken())
}
