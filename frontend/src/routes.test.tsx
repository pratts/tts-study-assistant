import { act, screen, waitFor } from '@testing-library/react'
import { getToken } from '@/lib/auth'
import { startSession } from '@/lib/session'
import { makeJwt } from '@/test/fixtures'
import { db, seedUser } from '@/test/handlers'
import { currentPath, renderApp } from '@/test/render-app'

describe('routing and guards', () => {
  it.each(['/dashboard', '/notes?page=2', '/profile'])('sends %s to login with next when logged out', async (path) => {
    const { router } = renderApp(path, { as: false })
    await waitFor(() => expect(currentPath(router)).toBe(`/login?next=${encodeURIComponent(path)}`))
  })

  it('treats an expired token as no session', async () => {
    sessionStorage.setItem('access_token', makeJwt({ expInSeconds: -5 }))
    const { router } = renderApp('/dashboard', { as: false })
    await waitFor(() => expect(currentPath(router)).toBe('/login?next=%2Fdashboard'))
  })

  it('routes / to the dashboard or the login page', async () => {
    const loggedIn = renderApp('/')
    await waitFor(() => expect(currentPath(loggedIn.router)).toBe('/dashboard'))
    loggedIn.unmount()
    sessionStorage.clear()
    const loggedOut = renderApp('/', { as: false })
    await waitFor(() => expect(currentPath(loggedOut.router)).toBe('/login'))
  })

  it('redirects unknown paths to /', async () => {
    const { router } = renderApp('/nope', { as: false })
    await waitFor(() => expect(currentPath(router)).toBe('/login'))
  })
})

describe('session end', () => {
  afterEach(() => vi.useRealTimers())

  it('ends the session with a timer when the token expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user: alice } = seedUser()
    const short = makeJwt({ sub: alice.id, expInSeconds: 60 })
    db.tokens.set(short, alice.id)
    startSession(short)

    const { router } = renderApp('/profile', { as: false })
    await screen.findByDisplayValue('alice@example.com')

    await act(() => vi.advanceTimersByTimeAsync(61_000))
    await waitFor(() => expect(currentPath(router)).toBe('/login?next=%2Fprofile'))
    expect(getToken()).toBeNull()
    expect(await screen.findByText('Your session has ended. Please log in again.')).toBeInTheDocument()
  })

  it('ends the session on a TOKEN_EXPIRED response and clears cached data', async () => {
    const { router, queryClient, session } = renderApp('/profile')
    await screen.findByDisplayValue('alice@example.com')
    db.tokens.delete(session!.token) // the server no longer accepts the token

    await act(() => router.navigate('/dashboard'))
    await waitFor(() => expect(currentPath(router)).toBe('/login?next=%2Fdashboard'))
    expect(getToken()).toBeNull()
    await waitFor(() => expect(queryClient.getQueryData(['profile'])).toBeUndefined())
  })

  it('logs out from the user menu', async () => {
    const { user, router } = renderApp('/dashboard')
    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    await waitFor(() => expect(currentPath(router)).toBe('/login'))
    expect(getToken()).toBeNull()
  })
})
