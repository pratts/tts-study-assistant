import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { API_BASE } from './api'
import { dataCounts } from './db-counts'
import { clearRateLimitedMarker } from './rate-budget'

export default async function globalSetup() {
  const health = new URL('/health', API_BASE)
  const res = await fetch(health).catch(() => null)
  if (!res?.ok) throw new Error(`Backend not reachable at ${health}. Start it before running e2e (see README).`)
  clearRateLimitedMarker()

  const before = dataCounts()
  const dir = path.resolve(import.meta.dirname, '.cache')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'counts-before.json'), JSON.stringify(before))
  console.log(`[e2e] test data before: ${before ? `${before.users} users, ${before.notes} notes` : 'unknown (set E2E_DATABASE_URL to count)'}`)
}
