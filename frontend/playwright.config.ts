import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a real backend (not run in CI).
 *   npm run e2e       → Vite dev server on :5173
 *   npm run e2e:prod  → production build served with vercel.json headers on :4173
 * The backend must be running at E2E_API_BASE_URL with CORS allowing the
 * origin under test.
 */
const prod = process.env.E2E_MODE === 'prod'
const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3000/api/v1'
const port = prod ? 4173 : 5173
process.env.E2E_API_BASE_URL = apiBase

export default defineConfig({
  testDir: './e2e',
  // One worker: the rate-limit budget and test data are shared.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: prod ? 'chromium-prod' : 'chromium-dev', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: prod ? 'npm run build && node scripts/serve-dist.ts' : 'npm run dev',
    url: `http://localhost:${port}`,
    env: { VITE_API_BASE_URL: apiBase, PORT: String(port) },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
  },
})
