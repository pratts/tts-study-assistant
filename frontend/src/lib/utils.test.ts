import { displayDomain, safeHttpUrl, truncate } from '@/lib/utils'

describe('safeHttpUrl', () => {
  it.each(['https://example.com/a?b=1', 'http://localhost:3000/'])('allows %s', (url) => {
    expect(safeHttpUrl(url)).toBe(new URL(url).href)
  })

  it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'chrome-extension://abc/x.pdf', 'not a url', '', undefined])(
    'refuses %s',
    (url) => {
      expect(safeHttpUrl(url)).toBeNull()
    },
  )
})

describe('displayDomain', () => {
  it('labels local and PDF-viewer sources', () => {
    expect(displayDomain('mhjfbmdgcfjbbpaeojofohoefgiehjai')).toBe('Downloaded/Local file')
    expect(displayDomain('local-file')).toBe('Downloaded/Local file')
    expect(displayDomain('bbc.co.uk')).toBe('bbc.co.uk')
    expect(displayDomain(undefined)).toBe('Unknown')
  })
})

describe('truncate', () => {
  it('truncates by code points without splitting emoji', () => {
    expect(truncate('hello', 10)).toBe('hello')
    expect(truncate('😀😀😀', 2)).toBe('😀😀…')
  })
})
