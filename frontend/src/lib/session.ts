import { clearToken, getToken, setToken, tokenExpiry } from '@/lib/auth'

/**
 * Session lifecycle. A session is one access token; it ends when the token
 * expires (timer), when the API reports TOKEN_EXPIRED, when an authenticated
 * request is attempted without a token, or on logout. There is no refresh.
 */

type EndReason = 'expired' | 'logout'
type EndHandler = (reason: EndReason) => void

// setTimeout overflows above 2^31-1 ms (~24.8 days).
const MAX_TIMEOUT = 2 ** 31 - 1

let endHandler: EndHandler = () => {}
let timer: ReturnType<typeof setTimeout> | undefined

/** Registers what ending a session does (navigate, clear caches). See app.ts. */
export function setSessionEndHandler(handler: EndHandler): void {
  endHandler = handler
}

export function startSession(token: string): void {
  setToken(token)
  scheduleExpiry()
}

/** (Re)arms the expiry timer for the stored token, if any. */
export function scheduleExpiry(): void {
  clearTimeout(timer)
  const token = getToken()
  if (!token) return
  const exp = tokenExpiry(token)
  if (exp === null) return
  const delay = exp - Date.now()
  timer = setTimeout(() => (delay > MAX_TIMEOUT ? scheduleExpiry() : endSession('expired')), Math.min(delay, MAX_TIMEOUT))
}

export function endSession(reason: EndReason = 'expired'): void {
  clearTimeout(timer)
  timer = undefined
  clearToken()
  endHandler(reason)
}

export function hasSession(): boolean {
  return getToken() !== null
}

/**
 * Returns `next` if it is a same-site path, otherwise the fallback. Rejects
 * absolute URLs, protocol-relative (`//host`) and backslash tricks.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    if (url.pathname === '/login' || url.pathname === '/register') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

type Location = { pathname: string; search: string; hash: string }

/** `/login?next=<path>` for a location (the router's, or the window's). */
export function loginRedirectPath({ pathname, search, hash }: Location = window.location): string {
  const current = pathname + search + hash
  if (pathname === '/login' || pathname === '/register') return '/login'
  return `/login?next=${encodeURIComponent(current)}`
}
