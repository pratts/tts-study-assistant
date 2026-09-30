import { clearToken, getToken, setToken, tokenExpiry } from '@/lib/auth'
import { makeJwt } from '@/test/fixtures'

describe('auth token storage', () => {
  it('stores the token in sessionStorage, not localStorage', () => {
    const token = makeJwt()
    setToken(token)
    expect(getToken()).toBe(token)
    expect(sessionStorage.getItem('access_token')).toBe(token)
    expect(localStorage.length).toBe(0)
    clearToken()
    expect(getToken()).toBeNull()
  })

  it('treats an expired token as absent and removes it', () => {
    setToken(makeJwt({ expInSeconds: -1 }))
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem('access_token')).toBeNull()
  })

  it('treats a malformed token as absent', () => {
    for (const bad of ['garbage', 'a.b.c', 'a.' + btoa('{"exp":"soon"}') + '.c']) {
      setToken(bad)
      expect(getToken()).toBeNull()
    }
  })

  it('reads exp in milliseconds from base64url payloads', () => {
    const token = makeJwt({ expInSeconds: 60 })
    const exp = tokenExpiry(token)!
    expect(exp).toBeGreaterThan(Date.now() + 55_000)
    expect(exp).toBeLessThanOrEqual(Date.now() + 60_000)
  })
})
