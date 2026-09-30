import type { QueryClient } from '@tanstack/react-query'
import { createBrowserRouter, type createMemoryRouter } from 'react-router'
import { toast } from 'sonner'
import { createQueryClient } from '@/lib/query-client'
import { loginRedirectPath, scheduleExpiry, setSessionEndHandler } from '@/lib/session'
import { routes } from '@/routes'

type AppRouter = ReturnType<typeof createBrowserRouter> | ReturnType<typeof createMemoryRouter>

/**
 * What ending a session does. The token is already cleared (lib/session.ts):
 * navigate to the login page first, so no private page stays mounted and
 * refetches, then drop every cached query so the next user starts clean.
 */
export function connectSession(router: AppRouter, queryClient: QueryClient): void {
  let ending = false
  setSessionEndHandler((reason) => {
    if (ending) return
    ending = true
    const target = reason === 'logout' ? '/login' : loginRedirectPath(router.state.location)
    void router.navigate(target, { replace: true }).finally(() => {
      queryClient.clear()
      ending = false
      if (reason === 'expired') toast.info('Your session has ended. Please log in again.', { id: 'session-ended' })
    })
  })
  // A token left from earlier in this tab keeps its original expiry.
  scheduleExpiry()
}

export function createApp() {
  const queryClient = createQueryClient()
  const router = createBrowserRouter(routes)
  connectSession(router, queryClient)
  return { queryClient, router }
}
