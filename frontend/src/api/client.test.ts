import { http, HttpResponse } from 'msw'
import { ApiError, MESSAGES, request, requestData } from '@/api/client'
import { getToken, setToken } from '@/lib/auth'
import { setSessionEndHandler } from '@/lib/session'
import { makeJwt } from '@/test/fixtures'
import { API } from '@/test/handlers'
import { server } from '@/test/server'

function capture() {
  const seen: Request[] = []
  server.events.on('request:start', ({ request }) => void seen.push(request.clone()))
  return seen
}

describe('request', () => {
  const onEnd = vi.fn()
  beforeEach(() => setSessionEndHandler(onEnd))
  afterEach(() => {
    setSessionEndHandler(() => {})
    server.events.removeAllListeners()
    onEnd.mockReset()
  })

  it('sends Authorization only on authenticated requests and Content-Type only with a body', async () => {
    server.use(
      http.get(`${API}/echo`, () => HttpResponse.json({ ok: 1 })),
      http.post(`${API}/echo`, () => HttpResponse.json({ ok: 1 })),
    )
    const seen = capture()
    setToken(makeJwt())

    await request('/echo')
    await request('/echo', { method: 'POST', body: { a: 1 }, auth: false })

    expect(seen[0]!.headers.get('Authorization')).toMatch(/^Bearer /)
    expect(seen[0]!.headers.get('Content-Type')).toBeNull()
    expect(seen[1]!.headers.get('Authorization')).toBeNull()
    expect(seen[1]!.headers.get('Content-Type')).toBe('application/json')
  })

  it('does not send an authenticated request without a token and ends the session', async () => {
    const seen = capture()
    await expect(request('/user/profile')).rejects.toMatchObject({ status: 401, message: MESSAGES.sessionEnded })
    expect(seen).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledWith('expired')
  })

  it('ends the session on 401 TOKEN_EXPIRED', async () => {
    setToken(makeJwt()) // unknown to the fake backend
    await expect(request('/user/profile')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' })
    expect(onEnd).toHaveBeenCalledOnce()
    expect(getToken()).toBeNull()
  })

  it('keeps the session on other errors from authenticated requests', async () => {
    server.use(http.put(`${API}/user/password`, () => HttpResponse.json({ error: true, message: 'Incorrect old password' }, { status: 403 })))
    setToken(makeJwt())
    await expect(request('/user/password', { method: 'PUT', body: {} })).rejects.toMatchObject({
      status: 403,
      message: 'Incorrect old password',
    })
    expect(onEnd).not.toHaveBeenCalled()
    expect(getToken()).not.toBeNull()
  })

  it('does not end a session on 401s from public endpoints', async () => {
    await expect(request('/auth/login', { method: 'POST', body: { email: 'x@y.z', password: 'p' }, auth: false })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    })
    expect(onEnd).not.toHaveBeenCalled()
  })

  it.each([
    [429, { error: true, message: 'limiter says hi' }, MESSAGES.rateLimited],
    [500, { error: true, message: 'pq: relation "x" does not exist' }, MESSAGES.server],
    [502, 'Bad Gateway', MESSAGES.server],
    [404, 'not json', MESSAGES.unexpected],
  ])('maps %s to a safe message', async (status, body, message) => {
    server.use(
      http.get(`${API}/boom`, () =>
        typeof body === 'string' ? new HttpResponse(body, { status }) : HttpResponse.json(body, { status }),
      ),
    )
    const err = await request('/boom', { auth: false }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status, message })
  })

  it('maps network failures to a generic message', async () => {
    server.use(http.get(`${API}/down`, () => HttpResponse.error()))
    await expect(request('/down', { auth: false })).rejects.toMatchObject({ status: 0, message: MESSAGES.network })
  })

  it('reads 204 bodies without parsing', async () => {
    server.use(http.delete(`${API}/gone`, () => new HttpResponse(null, { status: 204 })))
    await expect(request('/gone', { method: 'DELETE', auth: false })).resolves.toBeUndefined()
  })

  it('lets aborts propagate as AbortError', async () => {
    server.use(http.get(`${API}/slow`, async () => new Promise(() => {})))
    const controller = new AbortController()
    const pending = request('/slow', { auth: false, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('unwraps the envelope and rejects a missing data field', async () => {
    server.use(
      http.get(`${API}/data`, () => HttpResponse.json({ success: true, data: [1, 2] })),
      http.get(`${API}/nodata`, () => HttpResponse.json({ success: true })),
    )
    await expect(requestData('/data', { auth: false })).resolves.toEqual([1, 2])
    await expect(requestData('/nodata', { auth: false })).rejects.toMatchObject({ message: MESSAGES.unexpected })
  })

  it('passes query parameters and skips empty ones', async () => {
    server.use(http.get(`${API}/q`, () => HttpResponse.json({})))
    const seen = capture()
    await request('/q', { auth: false, query: { page: 2, page_size: 10, source_url: '', x: undefined } })
    expect(new URL(seen[0]!.url).search).toBe('?page=2&page_size=10')
  })
})
