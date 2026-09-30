import { execFileSync } from 'node:child_process'
import { E2E_EMAIL_DOMAIN } from './api'

/**
 * Counts (and optionally deletes) e2e test users and their notes directly in
 * the backend database, because the API cannot delete users. Only rows whose
 * email ends in the e2e domain are touched. Needs E2E_DATABASE_URL and psql.
 */
const url = process.env.E2E_DATABASE_URL
const where = `email LIKE '%@${E2E_EMAIL_DOMAIN}'`

function psql(sql: string): string {
  return execFileSync('psql', [url!, '-At', '-c', sql], { encoding: 'utf8' }).trim()
}

export function dataCounts(): { users: number; notes: number } | null {
  if (!url) return null
  const [users, notes] = psql(
    `SELECT (SELECT count(*) FROM users WHERE ${where}), (SELECT count(*) FROM notes WHERE user_id IN (SELECT id FROM users WHERE ${where}))`,
  ).split('|')
  return { users: Number(users), notes: Number(notes) }
}

export function deleteTestUsers(): void {
  if (!url) return
  // Notes and refresh tokens cascade (ON DELETE CASCADE).
  psql(`DELETE FROM users WHERE ${where}`)
}
