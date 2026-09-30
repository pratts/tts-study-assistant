import type { Note, UserProfile } from '@/api/types'

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** An unsigned JWT-shaped token; the client only reads `exp`. */
export function makeJwt(claims: { sub?: string; expInSeconds?: number } = {}): string {
  const exp = Math.floor(Date.now() / 1000) + (claims.expInSeconds ?? 15 * 60)
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ user_id: claims.sub ?? 'u-1', exp })}.sig`
}

export const alice: UserProfile & { password: string } = {
  id: '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e',
  name: 'Alice',
  email: 'alice@example.com',
  password: 'correct horse battery staple',
}

let seq = 0
export function makeNote(overrides: Partial<Note> = {}): Note {
  seq += 1
  const created = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString()
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    content: `Note number ${seq} with enough text to summarize properly.`,
    source_url: `https://blog.example.com/post-${seq}`,
    source_title: `Post ${seq}`,
    domain: 'example.com',
    created_at: created,
    updated_at: created,
    ...overrides,
  }
}
