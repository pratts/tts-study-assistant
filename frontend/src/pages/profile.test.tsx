import { screen, waitFor, within } from '@testing-library/react'
import { getToken } from '@/lib/auth'
import { alice } from '@/test/fixtures'
import { db, seedUser } from '@/test/handlers'
import { currentPath, renderApp } from '@/test/render-app'

describe('profile page', () => {
  it('updates the name and refreshes the sidebar from the response', async () => {
    const { user } = renderApp('/profile')
    const name = await screen.findByLabelText('Name')
    expect(name).toHaveValue('Alice')

    await user.clear(name)
    await user.type(name, 'Alice Liddell')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('Profile updated')).toBeInTheDocument()
    const sidebar = screen.getByRole('button', { name: 'Account menu' })
    expect(within(sidebar).getByText('Alice Liddell')).toBeInTheDocument()
    expect(db.users[0]?.name).toBe('Alice Liddell')
  })

  it('shows a conflict when the email is taken', async () => {
    seedUser({ id: 'u-bob', name: 'Bob', email: 'bob@example.com', password: 'x' })
    const { user } = renderApp('/profile')
    const email = await screen.findByLabelText('Email')
    await user.clear(email)
    await user.type(email, 'bob@example.com')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already taken')
  })

  it('keeps the session when the old password is wrong (403)', async () => {
    const { user, router } = renderApp('/profile')
    await user.type(await screen.findByLabelText('Current password'), 'wrong')
    await user.type(screen.getByLabelText('New password'), 'new secret')
    await user.type(screen.getByLabelText('Confirm new password'), 'new secret')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect old password')
    expect(currentPath(router)).toBe('/profile')
    expect(getToken()).not.toBeNull()
  })

  it('changes the password', async () => {
    const { user } = renderApp('/profile')
    await user.type(await screen.findByLabelText('Current password'), alice.password)
    await user.type(screen.getByLabelText('New password'), 'new secret')
    await user.type(screen.getByLabelText('Confirm new password'), 'new secret')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Password updated')).toBeInTheDocument()
    expect(db.users[0]?.password).toBe('new secret')
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''))
  })

  it('checks that the new passwords match', async () => {
    const { user } = renderApp('/profile')
    await user.type(await screen.findByLabelText('Current password'), alice.password)
    await user.type(screen.getByLabelText('New password'), 'one')
    await user.type(screen.getByLabelText('Confirm new password'), 'two')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
  })
})
