/**
 * Access-token storage. The token lives in sessionStorage (per tab, gone when
 * the tab closes). An expired or malformed token is treated as absent.
 */
const TOKEN_KEY = 'access_token'

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Returns the JWT `exp` claim in milliseconds, or null if unreadable. */
export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp: unknown = JSON.parse(json).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

export function getToken(now: number = Date.now()): string | null {
  const token = storage()?.getItem(TOKEN_KEY) ?? null
  if (!token) return null
  const exp = tokenExpiry(token)
  if (exp === null || exp <= now) {
    clearToken()
    return null
  }
  return token
}

export function setToken(token: string): void {
  storage()?.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  storage()?.removeItem(TOKEN_KEY)
}
