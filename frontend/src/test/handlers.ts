import { http, HttpResponse, type JsonBodyType } from 'msw'
import type { Note, NotesStats, UserProfile } from '@/api/types'
import { alice, makeJwt, makeNote } from '@/test/fixtures'

/**
 * An in-memory fake of the backend that follows backend/openapi.json and the
 * backend's actual behaviour: envelopes, status codes, TOKEN_EXPIRED on
 * session 401s only, 403 for a wrong old password, clamped page_size,
 * owner-scoped notes, and "unavailable" summaries.
 */
export const API = 'http://api.test/api/v1'

type User = UserProfile & { password: string }

export const db = {
  users: [] as User[],
  notes: new Map<string, Note & { owner: string }>(),
  tokens: new Map<string, string>(), // token -> user id
  summarizer: 'disabled' as 'disabled' | 'ok' | 'unavailable',
  rateLimited: new Set<string>(), // "METHOD /path" that should answer 429
  reset() {
    this.users = []
    this.notes.clear()
    this.tokens.clear()
    this.summarizer = 'disabled'
    this.rateLimited.clear()
  },
}

export function seedUser(user: User = alice): { user: User; token: string } {
  if (!db.users.some((u) => u.id === user.id)) db.users.push({ ...user })
  const token = makeJwt({ sub: user.id })
  db.tokens.set(token, user.id)
  return { user, token }
}

export function seedNotes(userId: string, count: number, overrides: Partial<Note> = {}): Note[] {
  return Array.from({ length: count }, () => {
    const note = makeNote(overrides)
    db.notes.set(note.id, { ...note, owner: userId })
    return note
  })
}

const ok = (data?: JsonBodyType, message = 'OK') =>
  HttpResponse.json(data === undefined ? { success: true, message } : { success: true, message, data })
const fail = (status: number, message: string, code?: string) =>
  HttpResponse.json(code ? { error: true, message, code } : { error: true, message }, { status })
const sessionExpired = () => fail(401, 'Token expired', 'TOKEN_EXPIRED')

function authUser(request: Request): User | null {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  const id = db.tokens.get(token)
  return db.users.find((u) => u.id === id) ?? null
}

const publicNote = ({ owner: _owner, ...note }: Note & { owner: string }): Note => note
const profile = ({ password: _password, ...user }: User): UserProfile => user
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function limited(method: string, path: string) {
  return db.rateLimited.has(`${method} ${path}`) ? fail(429, 'Too many requests, please try again later') : null
}

function session(user: User) {
  const token = makeJwt({ sub: user.id })
  db.tokens.set(token, user.id)
  return { access_token: token, refresh_token: `refresh-${user.id}`, user: profile(user) }
}

export const handlers = [
  http.post(`${API}/auth/register`, async ({ request }) => {
    const hit = limited('POST', '/auth/register')
    if (hit) return hit
    const body = (await request.json()) as Record<string, string>
    const email = body.email?.trim().toLowerCase()
    if (!email || !body.password || !body.name?.trim()) return fail(400, 'Email, password, and name are required')
    if (db.users.some((u) => u.email === email)) return fail(409, 'User already exists')
    const user: User = { id: crypto.randomUUID(), email, name: body.name.trim(), password: body.password }
    db.users.push(user)
    return ok(session(user), 'User registered successfully')
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const hit = limited('POST', '/auth/login')
    if (hit) return hit
    const body = (await request.json()) as Record<string, string>
    if (!body.email || !body.password) return fail(400, 'Email and password are required')
    const user = db.users.find((u) => u.email === body.email?.trim().toLowerCase())
    if (!user || user.password !== body.password) return fail(401, 'Invalid credentials')
    return ok(session(user), 'Login successful')
  }),

  http.get(`${API}/user/profile`, ({ request }) => {
    const user = authUser(request)
    return user ? ok(profile(user)) : sessionExpired()
  }),

  http.put(`${API}/user/profile`, async ({ request }) => {
    const user = authUser(request)
    if (!user) return sessionExpired()
    const body = (await request.json()) as Record<string, string>
    if (body.email && db.users.some((u) => u.email === body.email && u.id !== user.id)) {
      return fail(409, 'Email already taken')
    }
    if (body.name) user.name = body.name
    if (body.email) user.email = body.email
    return ok(profile(user), 'Profile updated successfully')
  }),

  http.put(`${API}/user/password`, async ({ request }) => {
    const user = authUser(request)
    if (!user) return sessionExpired()
    const body = (await request.json()) as Record<string, string>
    if (!body.old_password || !body.new_password) return fail(400, 'Old and new password are required')
    if (body.old_password !== user.password) return fail(403, 'Incorrect old password')
    user.password = body.new_password
    return ok(undefined, 'Password updated successfully')
  }),

  http.get(`${API}/notes/stats`, ({ request }) => {
    const user = authUser(request)
    if (!user) return sessionExpired()
    const counts = new Map<string, number>()
    for (const n of db.notes.values()) if (n.owner === user.id) counts.set(n.domain ?? '', (counts.get(n.domain ?? '') ?? 0) + 1)
    const stats: NotesStats[] = [...counts].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count)
    return ok(stats)
  }),

  http.get(`${API}/notes`, ({ request }) => {
    const user = authUser(request)
    if (!user) return sessionExpired()
    const url = new URL(request.url)
    const page = Math.max(Number(url.searchParams.get('page') ?? 1) || 1, 1)
    const rawSize = Number(url.searchParams.get('page_size') ?? 10) || 10
    const size = Math.min(rawSize < 1 ? 10 : rawSize, 100)
    const sourceUrl = url.searchParams.get('source_url')
    const all = [...db.notes.values()]
      .filter((n) => n.owner === user.id && (!sourceUrl || n.source_url === sourceUrl))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return ok(all.slice((page - 1) * size, page * size).map(publicNote))
  }),

  http.post(`${API}/notes`, async ({ request }) => {
    const user = authUser(request)
    if (!user) return sessionExpired()
    const body = (await request.json()) as Record<string, string>
    if (!body.content) return fail(400, 'Content is required')
    const note = makeNote({
      content: body.content,
      source_url: body.source_url || undefined,
      source_title: body.source_title || undefined,
      domain: body.domain || (body.source_url ? new URL(body.source_url).hostname.split('.').slice(-2).join('.') : undefined),
      created_at: new Date().toISOString(),
    })
    db.notes.set(note.id, { ...note, owner: user.id })
    return ok(note, 'Note created successfully')
  }),

  http.post(`${API}/notes/:id/summarize`, ({ request, params }) => {
    const found = ownedNote(request, params.id)
    if (found instanceof Response) return found
    const hit = limited('POST', '/notes/:id/summarize')
    if (hit) return hit
    if (db.summarizer === 'disabled') return fail(503, 'Summarization is not configured')
    found.summary = db.summarizer === 'unavailable' ? 'unavailable' : `Summary of: ${found.content.slice(0, 20)}`
    return ok({ summary: found.summary }, 'Note summarized successfully')
  }),

  http.get(`${API}/notes/:id`, ({ request, params }) => {
    const found = ownedNote(request, params.id)
    return found instanceof Response ? found : ok(publicNote(found))
  }),

  http.delete(`${API}/notes/:id`, ({ request, params }) => {
    const found = ownedNote(request, params.id)
    if (found instanceof Response) return found
    db.notes.delete(found.id)
    return ok(undefined, 'Note deleted successfully')
  }),

  http.put(`${API}/notes/:id`, async ({ request, params }) => {
    const found = ownedNote(request, params.id)
    if (found instanceof Response) return found
    const body = (await request.json()) as Partial<Record<keyof Note, string>>
    if (body.content === '') return fail(400, 'Content cannot be empty')
    if (body.content !== undefined && body.content !== found.content) {
      found.content = body.content
      found.summary = undefined
    }
    for (const key of ['source_url', 'source_title', 'domain'] as const) {
      if (body[key] !== undefined) found[key] = body[key] || undefined
    }
    found.updated_at = new Date().toISOString()
    return ok(publicNote(found), 'Note updated successfully')
  }),
]

/** Resolves a note owned by the caller, or the error response the API gives. */
function ownedNote(request: Request, rawId: unknown): (Note & { owner: string }) | Response {
  const user = authUser(request)
  if (!user) return sessionExpired()
  const id = String(rawId)
  if (!UUID_RE.test(id)) return fail(400, 'Invalid note ID')
  const note = db.notes.get(id)
  return note && note.owner === user.id ? note : fail(404, 'Note not found')
}
