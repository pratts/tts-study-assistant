import { createUser, type TestUser } from './api'
import { BUDGET_TIMEOUT, expect, test, useSession } from './fixtures'
import { takeAuthBudget } from './rate-budget'

test.describe.configure({ mode: 'serial' })

let user: TestUser

test.beforeAll(async () => {
  test.setTimeout(BUDGET_TIMEOUT) // may wait for the rate budget
  user = await createUser('profile')
})

test('update the name; the sidebar follows', async ({ page }) => {
  await useSession(page, user, '/profile')
  await page.getByLabel('Name').fill('E2E Renamed')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile updated')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account menu' })).toContainText('E2E Renamed')
})

test('a wrong current password keeps the session (403)', async ({ page, expectStatus }) => {
  expectStatus('PUT', /\/user\/password$/, 403)
  await useSession(page, user, '/profile')
  await page.getByLabel('Current password').fill('definitely wrong')
  await page.getByLabel('New password', { exact: true }).fill('new-pass')
  await page.getByLabel('Confirm new password').fill('new-pass')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByRole('alert')).toContainText('Incorrect old password')
  await expect(page).toHaveURL('/profile')
})

test('change the password and log in with the new one', async ({ page }) => {
  test.setTimeout(BUDGET_TIMEOUT)
  const next = `${user.password}-2`
  await useSession(page, user, '/profile')
  await page.getByLabel('Current password').fill(user.password)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password').fill(next)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Password updated')).toBeVisible()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  // Wait for the login page itself: the profile page also has an Email field.
  await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible()
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(next)
  await takeAuthBudget('ui login (new password)')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/dashboard')
})
