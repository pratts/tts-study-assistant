import { redirect, type RouteObject } from 'react-router'
import type { RouteHandle } from '@/components/app-layout'
import { FullPageSpinner, RouteError } from '@/components/route-status'
import { hasSession, safeNextPath } from '@/lib/session'

/** Guard for private routes: no valid token → /login?next=<path>. */
export function requireSession({ request }: { request: Request }) {
  if (hasSession()) return null
  const url = new URL(request.url)
  const next = url.pathname + url.search + url.hash
  return redirect(`/login?next=${encodeURIComponent(next)}`)
}

/** Guard for /login and /register: already logged in → `next` or /dashboard. */
export function redirectIfSession({ request }: { request: Request }) {
  if (!hasSession()) return null
  return redirect(safeNextPath(new URL(request.url).searchParams.get('next')))
}

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const routes: RouteObject[] = [
  {
    HydrateFallback: FullPageSpinner,
    ErrorBoundary: RouteError,
    children: [
      { index: true, loader: () => redirect(hasSession() ? '/dashboard' : '/login') },
      { path: 'login', loader: redirectIfSession, lazy: page(() => import('@/pages/login')) },
      { path: 'register', loader: redirectIfSession, lazy: page(() => import('@/pages/register')) },
      { path: 'privacy-policy', lazy: page(() => import('@/pages/privacy-policy')) },
      {
        loader: requireSession,
        lazy: page(() => import('@/components/app-layout')),
        children: [
          { path: 'dashboard', handle: { title: 'Dashboard' } satisfies RouteHandle, lazy: page(() => import('@/pages/dashboard')) },
          { path: 'notes', handle: { title: 'Notes' } satisfies RouteHandle, lazy: page(() => import('@/pages/notes')) },
          { path: 'profile', handle: { title: 'Profile' } satisfies RouteHandle, lazy: page(() => import('@/pages/profile')) },
        ],
      },
      { path: '*', loader: () => redirect('/') },
    ],
  },
]
