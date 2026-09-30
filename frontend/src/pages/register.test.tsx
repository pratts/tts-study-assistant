import { screen, waitFor } from '@testing-library/react'
import { MESSAGES } from '@/api/client'
import { getToken } from '@/lib/auth'
import { db, seedUser } from '@/test/handlers'
import { currentPath, renderApp } from '@/test/render-app'

async function fill(user: ReturnType<typeof renderApp>['user'], values: { name: string; email: string; password: string }) {
  await user.type(screen.getByLabelText('Name'), values.name)
  await user.type(screen.getByLabelText('Email'), values.email)
  await user.type(screen.getByLabelText('Password'), values.password)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('register page', () => {
  it('creates the account, starts the session and shows the user in the sidebar', async () => {
    const { user, router } = renderApp('/register', { as: false })
    await screen.findByLabelText('Name')
    await fill(user, { name: 'Bob', email: 'Bob@Example.com', password: 'hunter2 but longer' })

    await waitFor(() => expect(currentPath(router)).toBe('/dashboard'))
    expect(getToken()).not.toBeNull()
    expect(db.users[0]).toMatchObject({ email: 'bob@example.com', password: 'hunter2 but longer' }) // raw, not hashed
    expect(await screen.findByText('bob@example.com')).toBeInTheDocument()
  })

  it('shows a conflict for an existing email', async () => {
    seedUser()
    const { user } = renderApp('/register', { as: false })
    await screen.findByLabelText('Name')
    await fill(user, { name: 'Alice', email: 'alice@example.com', password: 'pw' })
    expect(await screen.findByRole('alert')).toHaveTextContent('User already exists')
  })

  it('enforces the 72-byte password limit and the email rule client-side', async () => {
    const { user } = renderApp('/register', { as: false })
    await screen.findByLabelText('Name')
    await fill(user, { name: 'A', email: 'Bob <bob@example.com>', password: 'é'.repeat(37) })
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText(/Password is too long/)).toBeInTheDocument()
    expect(db.users).toHaveLength(0)
  })

  it('shows the fixed rate-limit message on 429', async () => {
    db.rateLimited.add('POST /auth/register')
    const { user } = renderApp('/register', { as: false })
    await screen.findByLabelText('Name')
    await fill(user, { name: 'Bob', email: 'bob@example.com', password: 'pw' })
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.rateLimited)
  })

  it('links back to login keeping next', async () => {
    renderApp('/register?next=%2Fnotes', { as: false })
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fnotes')
  })
})
