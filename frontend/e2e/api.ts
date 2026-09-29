import { request, type APIRequestContext } from '@playwright/test'
import { takeAuthBudget } from './rate-budget'

/** Direct API access for test setup (no browser, no CORS). */
export const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3000/api/v1'
export const E2E_EMAIL_DOMAIN = 'e2e.example.test'
const runId = Date.now().toString(36)
let seq = 0

export type TestUser = { name: string; email: string; password: string; token: string; id: string }

export function newCredentials(label: string) {
  seq += 1
  return {
    name: `E2E ${label}`,
    email: `e2e-${runId}-${seq}-${label}@${E2E_EMAIL_DOMAIN}`,
    password: `pw-${runId}-${seq}-ünïcødé`,
  }
}

async function context(token?: string): Promise<APIRequestContext> {
  return request.newContext({ extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {} })
}

async function call<T>(method: string, pathname: string, { token, body }: { token?: string; body?: unknown } = {}): Promise<T> {
  const ctx = await context(token)
  try {
    const res = await ctx.fetch(API_BASE + pathname, { method, data: body })
    const json = (await res.json().catch(() => ({}))) as { data?: T; message?: string }
    if (!res.ok()) throw new Error(`${method} ${pathname} → ${res.status()} ${json.message ?? ''}`)
    return json.data as T
  } finally {
    await ctx.dispose()
  }
}

/** Registers a user through the API (counts against the auth budget). */
export async function createUser(label: string): Promise<TestUser> {
  const creds = newCredentials(label)
  await takeAuthBudget(`register ${label}`)
  const res = await call<{ access_token: string; user: { id: string } }>('POST', '/auth/register', { body: creds })
  return { ...creds, token: res.access_token, id: res.user.id }
}

export async function createNotes(token: string, count: number, make: (i: number) => Record<string, string>) {
  const notes: { id: string }[] = []
  for (let i = 0; i < count; i++) notes.push(await call<{ id: string }>('POST', '/notes', { token, body: make(i) }))
  return notes
}

export async function listNotes(token: string, pageSize = 100) {
  return call<{ id: string; content: string }[]>('GET', `/notes?page_size=${pageSize}`, { token })
}

export async function deleteAllNotes(token: string): Promise<number> {
  let deleted = 0
  for (;;) {
    const notes = await listNotes(token)
    if (notes.length === 0) return deleted
    for (const note of notes) {
      await call('DELETE', `/notes/${note.id}`, { token })
      deleted += 1
    }
  }
}
