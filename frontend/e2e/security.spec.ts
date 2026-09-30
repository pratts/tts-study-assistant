import { expect, test } from './fixtures'

const prod = process.env.E2E_MODE === 'prod'

test('production responses carry the deployment headers', async ({ page }) => {
  test.skip(!prod, 'headers come from vercel.json, served only in the production run')
  const res = await page.goto('/notes')
  const headers = res!.headers()
  const csp = headers['content-security-policy'] ?? ''
  expect(csp).toContain("script-src 'self'")
  expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
  expect(csp).toContain(`connect-src 'self' ${new URL(process.env.E2E_API_BASE_URL!).origin}`)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()')
})

test('theme follows the saved choice before first paint and toggles', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})
