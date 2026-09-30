import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MESSAGES } from '@/api/client'
import { alice } from '@/test/fixtures'
import { API, db, seedNotes } from '@/test/handlers'
import { server } from '@/test/server'
import { currentPath, renderApp } from '@/test/render-app'

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('notes page', () => {
  it('pages with previous/next and page size', async () => {
    seedNotes(alice.id, 12)
    const { user, router } = renderApp('/notes')
    await waitFor(() => expect(rows()).toHaveLength(10))
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Next/ }))
    await waitFor(() => expect(currentPath(router)).toBe('/notes?page=2'))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.getByText('Page 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled() // short page = last page

    await user.click(screen.getByRole('combobox', { name: 'Per page' }))
    await user.click(await screen.findByRole('option', { name: '25' }))
    await waitFor(() => expect(currentPath(router)).toBe('/notes?size=25'))
    await waitFor(() => expect(rows()).toHaveLength(12))
  })

  it('creates a note and restarts the list on page 1', async () => {
    seedNotes(alice.id, 11)
    const { user, router } = renderApp('/notes?page=2')
    await waitFor(() => expect(rows()).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'New note' }))
    const dialog = await screen.findByRole('dialog', { name: 'New note' })
    await user.type(within(dialog).getByLabelText('Content'), 'A brand new note')
    await user.type(within(dialog).getByLabelText('Source URL (optional)'), 'https://news.example.com/x')
    await user.click(within(dialog).getByRole('button', { name: 'Create note' }))

    expect(await screen.findByText('Note created')).toBeInTheDocument()
    await waitFor(() => expect(currentPath(router)).toBe('/notes'))
    expect(await screen.findByText('A brand new note')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('validates the note form', async () => {
    const { user } = renderApp('/notes')
    await user.click(await screen.findByRole('button', { name: 'New note' }))
    const dialog = await screen.findByRole('dialog', { name: 'New note' })
    await user.type(within(dialog).getByLabelText('Content'), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Create note' }))
    expect(await within(dialog).findByText('Content is required')).toBeInTheDocument()
    expect(db.notes.size).toBe(0)
  })

  it('edits a note, clearing a field', async () => {
    const [note] = seedNotes(alice.id, 1, { content: 'Old text', source_title: 'Old title' })
    const { user } = renderApp('/notes')
    await user.click(await screen.findByRole('button', { name: 'Edit note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit note' })
    const content = within(dialog).getByLabelText('Content')
    expect(content).toHaveValue('Old text')
    await user.clear(content)
    await user.type(content, 'New text')
    await user.clear(within(dialog).getByLabelText('Source title (optional)'))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Note updated')).toBeInTheDocument()
    expect(await screen.findByText('New text')).toBeInTheDocument()
    expect(db.notes.get(note!.id)).toMatchObject({ content: 'New text', source_title: undefined })
  })

  it('deletes a note after confirmation', async () => {
    seedNotes(alice.id, 1, { content: 'Delete me' })
    const { user } = renderApp('/notes')
    await user.click(await screen.findByRole('button', { name: 'Delete note' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete me')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Note deleted')).toBeInTheDocument()
    expect(await screen.findByText('No notes yet')).toBeInTheDocument()
    expect(db.notes.size).toBe(0)
  })

  it('shows a generic error when summarization is not configured (503)', async () => {
    seedNotes(alice.id, 1)
    const { user } = renderApp('/notes')
    await user.click(await screen.findByRole('button', { name: 'Generate summary' }))
    expect(await screen.findByText(MESSAGES.server)).toBeInTheDocument()
  })

  it('stores a summary and hides the button; reports "unavailable"', async () => {
    const [first, second] = seedNotes(alice.id, 2)
    db.summarizer = 'ok'
    const { user } = renderApp('/notes')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Generate summary' })).toHaveLength(2))

    await user.click(screen.getAllByRole('button', { name: 'Generate summary' })[0]!)
    expect(await screen.findByText('Summary ready')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Generate summary' })).toHaveLength(1))

    db.summarizer = 'unavailable'
    await user.click(screen.getByRole('button', { name: 'Generate summary' }))
    expect(await screen.findByText(/Summary unavailable/)).toBeInTheDocument()
    expect(db.notes.get(second!.id)?.summary ?? db.notes.get(first!.id)?.summary).toBeDefined()
  })

  it('shows the rate-limit message for summarize (429)', async () => {
    seedNotes(alice.id, 1)
    db.summarizer = 'ok'
    db.rateLimited.add('POST /notes/:id/summarize')
    const { user } = renderApp('/notes')
    await user.click(await screen.findByRole('button', { name: 'Generate summary' }))
    expect(await screen.findByText(MESSAGES.rateLimited)).toBeInTheDocument()
  })

  it('opens the details dialog and summarizes there', async () => {
    seedNotes(alice.id, 1, { content: 'Detailed note content', source_url: 'https://example.com/a', source_title: 'Example' })
    db.summarizer = 'ok'
    const { user } = renderApp('/notes')
    await user.click(await screen.findByRole('button', { name: 'View note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note details' })
    expect(await within(dialog).findByText('Detailed note content')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Example/ })).toHaveAttribute('href', 'https://example.com/a')

    await user.click(within(dialog).getByRole('button', { name: 'Generate summary' }))
    expect(await within(dialog).findByText(/Summary of: Detailed note/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('never links non-http source URLs', async () => {
    seedNotes(alice.id, 1, { source_url: 'javascript:alert(1)', source_title: 'Sneaky' })
    renderApp('/notes')
    expect(await screen.findByText('Sneaky')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sneaky/ })).not.toBeInTheDocument()
  })

  it('filters by source URL and restarts at page 1', async () => {
    seedNotes(alice.id, 3)
    seedNotes(alice.id, 1, { source_url: 'https://only.example.com/this', content: 'The only match' })
    const { user, router } = renderApp('/notes?page=1')
    await waitFor(() => expect(rows()).toHaveLength(4))

    await user.type(screen.getByLabelText('Filter by source URL'), 'https://only.example.com/this') // no Enter: applies as you type
    await waitFor(() => expect(currentPath(router)).toBe('/notes?source=https%3A%2F%2Fonly.example.com%2Fthis'))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.getByText('The only match')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear source filter' }))
    await waitFor(() => expect(rows()).toHaveLength(4))
  })

  it('shows nothing, not stale rows, when the typed URL matches no note', async () => {
    seedNotes(alice.id, 3)
    const { user, router } = renderApp('/notes')
    await waitFor(() => expect(rows()).toHaveLength(3))

    await user.type(screen.getByLabelText('Filter by source URL'), 'https://nothing.example')
    await waitFor(() => expect(currentPath(router)).toBe('/notes?source=https%3A%2F%2Fnothing.example'))
    expect(await screen.findByText('No notes from this source')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('follows the URL when the filter changes from outside', async () => {
    seedNotes(alice.id, 2)
    const { router } = renderApp('/notes?source=https%3A%2F%2Fa.example')
    expect(await screen.findByLabelText('Filter by source URL')).toHaveValue('https://a.example')
    await act(() => router.navigate('/notes'))
    await waitFor(() => expect(screen.getByLabelText('Filter by source URL')).toHaveValue(''))
    await waitFor(() => expect(rows()).toHaveLength(2))
  })

  it('shows the empty state and an error with retry', async () => {
    let fail = true
    server.use(
      http.get(`${API}/notes`, () =>
        fail ? HttpResponse.error() : HttpResponse.json({ success: true, data: [] }),
      ),
    )
    const { user } = renderApp('/notes')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(MESSAGES.network)
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No notes yet')).toBeInTheDocument()
  })

  it('returns to login with next when the session is rejected', async () => {
    const { router, session } = renderApp('/notes?page=3')
    db.tokens.delete(session!.token)
    await waitFor(() => expect(currentPath(router)).toBe('/login?next=%2Fnotes%3Fpage%3D3'))
  })
})
