import { test as base, expect, type Page } from '@playwright/test'
import { API_BASE, type TestUser } from './api'
import { markRateLimited, rateLimitedDetail } from './rate-budget'

/** Timeout for tests and hooks that may wait for the auth rate budget (up to 2 min). */
export const BUDGET_TIMEOUT = 180_000

type AllowedStatus = { method: string; url: RegExp; status: number }

type Fixtures = {
  /** Declare an expected 4xx/5xx response; anything else fails the test. */
  expectStatus: (method: string, url: RegExp, status: number) => void
}

/**
 * Every test fails on: console errors, uncaught page errors, CORS errors,
 * failed requests, unexpected 4xx/5xx responses and CSP violations (reported
 * live through an exposed binding). Only aborted fetch GETs to the API count
 * as cancellations (TanStack Query / StrictMode); nothing else is ignored.
 */
export const test = base.extend<Fixtures>({
  expectStatus: [
    async ({ page }, use) => {
      const stoppedBy = rateLimitedDetail()
      test.skip(stoppedBy !== null, `Stopped after the first 429: ${stoppedBy}`)

      const problems: string[] = []
      const allowed: AllowedStatus[] = []
      const isAllowed = (method: string, url: string, status: number) =>
        allowed.some((a) => a.status === status && a.url.test(url) && (a.method === '*' || a.method === method))

      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        // Chrome logs every non-2xx fetch as "Failed to load resource"; only
        // allow those that the test declared.
        const failed = /Failed to load resource: the server responded with a status of (\d{3})/.exec(text)
        if (failed && allowed.some((a) => a.status === Number(failed[1]) && a.url.test(msg.location().url))) return
        problems.push(`console.error: ${text} (${msg.location().url})`)
      })
      page.on('requestfailed', (req) => {
        const reason = req.failure()?.errorText ?? 'unknown'
        const cancelled = /ERR_ABORTED|NS_BINDING_ABORTED/.test(reason)
        if (cancelled && req.method() === 'GET' && req.resourceType() === 'fetch' && req.url().startsWith(API_BASE)) return
        problems.push(`request failed: ${req.method()} ${req.url()} (${reason})`)
      })
      page.on('response', (res) => {
        const status = res.status()
        if (status < 400) return
        const method = res.request().method()
        if (status === 429) markRateLimited(`${method} ${res.url()}`)
        if (!isAllowed(method, res.url(), status)) problems.push(`unexpected ${status}: ${method} ${res.url()}`)
      })
      await page.exposeBinding('__e2eCspViolation', (_source, detail: string) => {
        problems.push(`CSP violation: ${detail}`)
      })
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          const report = (window as unknown as { __e2eCspViolation: (d: string) => void }).__e2eCspViolation
          void report(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} at ${e.sourceFile}:${e.lineNumber}`)
        })
      })

      await use((method, url, status) => {
        allowed.push({ method, url, status })
      })

      expect(problems, 'browser problems during the test').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Starts a session in this tab with an API-issued token (no login request). */
export async function useSession(page: Page, user: TestUser, path = '/dashboard') {
  await page.goto('/privacy-policy')
  await page.evaluate((token) => sessionStorage.setItem('access_token', token), user.token)
  await page.goto(path)
}
