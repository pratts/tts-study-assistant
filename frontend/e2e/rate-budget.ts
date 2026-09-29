import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The backend limits login and register to 10 requests per minute per IP
 * (fixed window) and has no switch to disable that. Budget over two windows
 * (a sliding-window limiter would carry a burst into the next window):
 * at most LIMIT limited requests in any 2-minute span. Wait instead of
 * exceeding it. The budget file survives runs so `e2e` followed by
 * `e2e:prod` stays within it too. With E2E_RATE_LIMITS=off the budget is
 * skipped (only for a backend with limits disabled).
 */
const LIMIT = 10
const SPAN_MS = 2 * 60_000
const dir = path.resolve(import.meta.dirname, '.cache')
const budgetFile = path.join(dir, 'rate-budget.json')
const stopFile = path.join(dir, 'rate-limited')

function read(): number[] {
  try {
    return JSON.parse(readFileSync(budgetFile, 'utf8')) as number[]
  } catch {
    return []
  }
}

export async function takeAuthBudget(label: string): Promise<void> {
  if (process.env.E2E_RATE_LIMITS === 'off') return
  mkdirSync(dir, { recursive: true })
  for (;;) {
    const now = Date.now()
    const recent = read().filter((t) => now - t < SPAN_MS)
    if (recent.length < LIMIT) {
      writeFileSync(budgetFile, JSON.stringify([...recent, now]))
      return
    }
    const waitMs = recent[0]! + SPAN_MS - now + 250
    console.log(`[rate budget] ${label}: waiting ${Math.ceil(waitMs / 1000)}s to stay under ${LIMIT} per ${SPAN_MS / 1000}s`)
    await new Promise((r) => setTimeout(r, waitMs))
  }
}

export function markRateLimited(detail: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(stopFile, detail)
}

export function rateLimitedDetail(): string | null {
  return existsSync(stopFile) ? readFileSync(stopFile, 'utf8') : null
}

export function clearRateLimitedMarker(): void {
  rmSync(stopFile, { force: true })
}
