import { newCredentials } from './api'
import { BUDGET_TIMEOUT, expect, test } from './fixtures'
import { takeAuthBudget } from './rate-budget'

test('private routes redirect to login with next', async ({ page }) => {
  await page.goto('/notes?page=2')
  await expect(page).toHaveURL('/login?next=%2Fnotes%3Fpage%3D2')
  await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible()
})

test('register, log out, and log back in to the next page', async ({ page }) => {
  test.setTimeout(2 * BUDGET_TIMEOUT)
  const creds = newCredentials('auth')
  await page.goto('/register')
  await page.getByLabel('Name').fill(creds.name)
  await page.getByLabel('Email').fill(creds.email.toUpperCase())
  await page.getByLabel('Password').fill(creds.password)
  await takeAuthBudget('ui register')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByText(`Welcome, ${creds.name}!`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account menu' })).toContainText(creds.email)
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')

  await page.goto('/profile')
  await expect(page).toHaveURL('/login?next=%2Fprofile')
  await page.getByLabel('Email').fill(creds.email)
  await page.getByLabel('Password').fill(creds.password)
  await takeAuthBudget('ui login')
  await page.getByLabel('Password').press('Enter')
  await expect(page).toHaveURL('/profile')
  await expect(page.getByLabel('Name')).toHaveValue(creds.name)
})

test('wrong password shows a form error', async ({ page, expectStatus }) => {
  test.setTimeout(BUDGET_TIMEOUT)
  expectStatus('POST', /\/auth\/login$/, 401)
  await page.goto('/login')
  await page.getByLabel('Email').fill(newCredentials('nobody').email)
  await page.getByLabel('Password').fill('not the password')
  await takeAuthBudget('ui login (wrong password)')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid credentials')
  await expect(page).toHaveURL('/login')
})
