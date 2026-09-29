import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { alice } from '@/test/fixtures'
import { API, seedNotes } from '@/test/handlers'
import { server } from '@/test/server'
import { renderApp } from '@/test/render-app'

describe('dashboard page', () => {
  it('shows totals, the latest note and notes per domain', async () => {
    seedNotes(alice.id, 2, { domain: 'example.com' })
    const [latest] = seedNotes(alice.id, 1, { domain: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', content: 'The newest note' })
    renderApp('/dashboard')

    expect(await screen.findByText('The newest note')).toBeInTheDocument()
    expect(latest).toBeDefined()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('example.com')).toBeInTheDocument()
    expect(within(table).getByText('Downloaded/Local file')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // total
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument() // sidebar user
  })

  it('shows empty states without notes', async () => {
    renderApp('/dashboard')
    expect(await screen.findByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to notes' })).toHaveAttribute('href', '/notes')
  })

  it('shows an error with retry', async () => {
    let fail = true
    server.use(
      http.get(`${API}/notes/stats`, () =>
        fail ? HttpResponse.json({ error: true, message: 'db down' }, { status: 500 }) : HttpResponse.json({ success: true, data: [] }),
      ),
    )
    const { user } = renderApp('/dashboard')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong on our side')
    expect(alert).not.toHaveTextContent('db down')
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Total notes')).toBeInTheDocument()
  })
})
