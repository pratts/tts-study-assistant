import { screen, waitFor } from '@testing-library/react'
import { MESSAGES } from '@/api/client'
import { getToken } from '@/lib/auth'
import { alice } from '@/test/fixtures'
import { db, seedUser } from '@/test/handlers'
import { currentPath, renderApp } from '@/test/render-app'

async function fillAndSubmit(user: ReturnType<typeof renderApp>['user'], email: string, password: string) {
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.keyboard('{Enter}') // forms work from the keyboard
}

describe('login page', () => {
  it('logs in with a raw password and goes to the same-site next path', async () => {
    seedUser()
    const { user, router } = renderApp('/login?next=%2Fnotes%3Fpage%3D2', { as: false })
    await fillAndSubmit(user, '  ALICE@example.com ', alice.password)

    await waitFor(() => expect(currentPath(router)).toBe('/notes?page=2'))
    expect(getToken()).not.toBeNull()
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('ignores an off-site next path', async () => {
    seedUser()
    const { user, router } = renderApp('/login?next=%2F%2Fevil.example%2F', { as: false })
    await fillAndSubmit(user, alice.email, alice.password)
    await waitFor(() => expect(currentPath(router)).toBe('/dashboard'))
  })

  it('shows invalid credentials as a form error', async () => {
    seedUser()
    const { user, router } = renderApp('/login', { as: false })
    await fillAndSubmit(user, alice.email, 'wrong password')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
    expect(currentPath(router)).toBe('/login')
    expect(getToken()).toBeNull()
  })

  it('shows the fixed rate-limit message on 429', async () => {
    seedUser()
    db.rateLimited.add('POST /auth/login')
    const { user } = renderApp('/login', { as: false })
    await fillAndSubmit(user, alice.email, alice.password)
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.rateLimited)
  })

  it('validates required fields before calling the API', async () => {
    const { user } = renderApp('/login', { as: false })
    await user.click(await screen.findByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('redirects away when already logged in', async () => {
    const { router } = renderApp('/login?next=%2Fprofile')
    await waitFor(() => expect(currentPath(router)).toBe('/profile'))
  })
})
