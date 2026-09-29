import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { connectSession } from '@/app'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { createQueryClient } from '@/lib/query-client'
import { startSession } from '@/lib/session'
import { routes } from '@/routes'
import { alice } from '@/test/fixtures'
import { seedUser } from '@/test/handlers'

type Options = {
  /** Log in as this user before rendering (default: alice). false = logged out. */
  as?: typeof alice | false
}

/** Renders the real app (routes, guards, session wiring) at `path`. */
export function renderApp(path: string, { as = alice }: Options = {}) {
  const session = as ? seedUser(as) : null
  if (session) startSession(session.token)

  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  connectSession(router, queryClient)

  const user = userEvent.setup()
  const utils = render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { ...utils, user, router, queryClient, session }
}

/** Current path of the memory router, including the query string. */
export function currentPath(router: ReturnType<typeof renderApp>['router']): string {
  const { pathname, search } = router.state.location
  return pathname + search
}
