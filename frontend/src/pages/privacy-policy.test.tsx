import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render-app'

describe('privacy policy page', () => {
  it('is public and describes server-side password hashing', async () => {
    renderApp('/privacy-policy', { as: false })
    expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/stored only as a salted hash/)).toBeInTheDocument()
    expect(screen.queryByText(/hashed on your device/)).not.toBeInTheDocument()
    expect(screen.getByText(/prateeksharma\.2801@gmail\.com/)).toBeInTheDocument()
  })
})
