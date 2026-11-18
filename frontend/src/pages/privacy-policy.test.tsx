import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render-app'

// The data the extension declares in manifest.json (data_collection_permissions)
// and how the policy describes each. extension/tests/manifest.test.mjs checks
// the other direction: every declared category and permission is worded here.
const DESCRIBED: Record<string, RegExp> = {
  websiteContent: /text you select and save/,
  browsingActivity: /address \(URL\) and title of the page/,
  authenticationInfo: /Sessions: login tokens/,
  personallyIdentifyingInfo: /your name, email address and password/,
}

async function renderPolicy() {
  renderApp('/privacy-policy', { as: false })
  expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
}

describe('privacy policy page', () => {
  it('is public and describes server-side password hashing', async () => {
    await renderPolicy()
    expect(screen.getByText(/stored only as a salted hash/)).toBeInTheDocument()
    expect(screen.queryByText(/hashed on your device/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/prateeksharma\.2801@gmail\.com/).length).toBeGreaterThan(0)
  })

  it('covers the extension in both browsers, not only Chrome', async () => {
    await renderPolicy()
    expect(screen.getByText(/browser extension for Chrome and Firefox/)).toBeInTheDocument()
    expect(screen.getByText(/The extension \(Chrome and Firefox\)/)).toBeInTheDocument()
    expect(screen.queryByText(/The Chrome extension/)).not.toBeInTheDocument()
  })

  it('describes every data category the extension manifest declares', async () => {
    await renderPolicy()
    for (const [category, description] of Object.entries(DESCRIBED)) {
      expect(screen.getByText(description), category).toBeInTheDocument()
    }
  })

  it('says where data goes and how to delete it', async () => {
    await renderPolicy()
    expect(screen.getByText(/sent to our AI provider \(currently OpenAI\)/)).toBeInTheDocument()
    expect(screen.getByText(/edit or delete any note at any time/)).toBeInTheDocument()
    expect(screen.getByText(/To delete your account and all its notes, email us/)).toBeInTheDocument()
  })

  it('lists the extension permissions from the manifest', async () => {
    await renderPolicy()
    const text = screen.getByText(/asks only for what its features need/).textContent ?? ''
    for (const wording of [/storage/, /text-to-speech/, /active tab/, /scripting/, /context menus/, /notifications/, /access to websites/]) {
      expect(text).toMatch(wording)
    }
  })
})
