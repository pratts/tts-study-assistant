import { readFileSync } from 'node:fs'
import path from 'node:path'
import { dataCounts, deleteTestUsers } from './db-counts'

export default async function globalTeardown() {
  const beforeFile = path.resolve(import.meta.dirname, '.cache/counts-before.json')
  const before = JSON.parse(readFileSync(beforeFile, 'utf8')) as ReturnType<typeof dataCounts>
  const leftover = dataCounts()
  deleteTestUsers()
  const after = dataCounts()
  if (!after) {
    console.log('[e2e] notes were deleted through the API; users remain (no delete-user API). Set E2E_DATABASE_URL to count and remove them.')
    return
  }
  console.log(
    `[e2e] test data: before ${before?.users ?? '?'} users / ${before?.notes ?? '?'} notes; ` +
      `left by this run ${leftover?.users} users / ${leftover?.notes} notes; after cleanup ${after.users} users / ${after.notes} notes`,
  )
}
