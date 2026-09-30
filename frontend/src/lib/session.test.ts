import { getToken } from '@/lib/auth'
import { endSession, hasSession, loginRedirectPath, safeNextPath, setSessionEndHandler, startSession } from '@/lib/session'
import { makeJwt } from '@/test/fixtures'

describe('session lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    setSessionEndHandler(() => {})
  })

  it('ends the session when the token expires', () => {
    vi.useFakeTimers()
    const onEnd = vi.fn()
    setSessionEndHandler(onEnd)
    startSession(makeJwt({ expInSeconds: 30 }))
    expect(hasSession()).toBe(true)

    vi.advanceTimersByTime(29_000)
    expect(onEnd).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(onEnd).toHaveBeenCalledWith('expired')
    expect(getToken()).toBeNull()
  })

  it('logout clears the token and reports the reason', () => {
    const onEnd = vi.fn()
    setSessionEndHandler(onEnd)
    startSession(makeJwt())
    endSession('logout')
    expect(hasSession()).toBe(false)
    expect(onEnd).toHaveBeenCalledWith('logout')
  })
})

describe('safeNextPath', () => {
  it.each([
    ['/notes', '/notes'],
    ['/notes?page=2#x', '/notes?page=2#x'],
    ['/profile', '/profile'],
  ])('accepts same-site path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([null, '', 'notes', 'https://evil.example/', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', '/login', '/register?x=1'])(
    'rejects %s',
    (input) => {
      expect(safeNextPath(input)).toBe('/dashboard')
    },
  )
})

describe('loginRedirectPath', () => {
  it('carries the current path', () => {
    window.history.pushState({}, '', '/notes?page=3')
    expect(loginRedirectPath()).toBe('/login?next=%2Fnotes%3Fpage%3D3')
    window.history.pushState({}, '', '/login?next=%2Fnotes')
    expect(loginRedirectPath()).toBe('/login')
    window.history.pushState({}, '', '/')
  })
})
