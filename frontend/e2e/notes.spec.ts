import { createNotes, createUser, deleteAllNotes, listNotes, type TestUser } from './api'
import { BUDGET_TIMEOUT, expect, test, useSession } from './fixtures'

test.describe.configure({ mode: 'serial' })

let user: TestUser

test.beforeAll(async () => {
  test.setTimeout(BUDGET_TIMEOUT) // may wait for the rate budget
  user = await createUser('notes')
})

test.afterAll(async () => {
  const deleted = await deleteAllNotes(user.token)
  console.log(`[e2e] notes cleanup: deleted ${deleted}, remaining ${(await listNotes(user.token)).length}`)
})

test('empty state, then create, view and copy a note', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await useSession(page, user, '/notes')
  await expect(page.getByText('No notes yet')).toBeVisible()

  await page.getByRole('button', { name: 'New note' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New note' })
  await dialog.getByLabel('Content').fill('Photosynthesis converts light into chemical energy.')
  await dialog.getByLabel('Source title (optional)').fill('Biology 101')
  await dialog.getByLabel('Source URL (optional)').fill('https://news.bbc.co.uk/science/photosynthesis')
  await dialog.getByRole('button', { name: 'Create note' }).click()

  await expect(page.getByText('Note created')).toBeVisible()
  const row = page.getByRole('row', { name: /Photosynthesis converts/ })
  await expect(row.getByText('bbc.co.uk')).toBeVisible()

  await row.getByRole('button', { name: 'Copy note' }).click()
  await expect(page.getByText('Copied to clipboard')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Photosynthesis converts light into chemical energy.')

  await row.getByRole('button', { name: 'View note' }).click()
  const details = page.getByRole('dialog', { name: 'Note details' })
  await expect(details.getByText('Photosynthesis converts light into chemical energy.')).toBeVisible()
  await expect(details.getByRole('link', { name: /Biology 101/ })).toHaveAttribute('href', 'https://news.bbc.co.uk/science/photosynthesis')
  await page.keyboard.press('Escape')
  await expect(details).toBeHidden()
})

test('summarize without an OpenAI key shows a generic error (503)', async ({ page, expectStatus }) => {
  expectStatus('POST', /\/notes\/[^/]+\/summarize$/, 503)
  await useSession(page, user, '/notes')
  await page.getByRole('button', { name: 'Generate summary' }).first().click()
  await expect(page.getByText('Something went wrong on our side. Please try again.')).toBeVisible()
})

test('edit a note', async ({ page }) => {
  await useSession(page, user, '/notes')
  await page.getByRole('button', { name: 'Edit note' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit note' })
  await dialog.getByLabel('Content').fill('Photosynthesis happens in chloroplasts.')
  await dialog.getByLabel('Source title (optional)').fill('')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Note updated')).toBeVisible()
  await expect(page.getByRole('row', { name: /chloroplasts/ })).toBeVisible()
})

test('paginate, change page size and filter by source URL', async ({ page }) => {
  await createNotes(user.token, 11, (i) => ({ content: `Bulk note ${i + 1}`, source_url: `https://example.com/bulk/${i + 1}` }))
  await useSession(page, user, '/notes')
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(10)

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL('/notes?page=2')
  await expect(rows).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

  await page.getByRole('combobox', { name: 'Per page' }).click()
  await page.getByRole('option', { name: '25' }).click()
  await expect(page).toHaveURL('/notes?size=25')
  await expect(rows).toHaveCount(12)

  await page.getByLabel('Filter by source URL').fill('https://example.com/bulk/3')
  await page.getByLabel('Filter by source URL').press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Bulk note 3')
  await page.getByRole('button', { name: 'Clear source filter' }).click()
  await expect(rows).toHaveCount(12)
})

test('delete a note after confirming', async ({ page }) => {
  await useSession(page, user, '/notes?size=25')
  const row = page.getByRole('row', { name: /chloroplasts/ })
  await row.getByRole('button', { name: 'Delete note' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('chloroplasts')
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Note deleted')).toBeVisible()
  await expect(page.getByRole('row', { name: /chloroplasts/ })).toHaveCount(0)
})

test('dashboard shows totals and domains', async ({ page }) => {
  await useSession(page, user, '/dashboard')
  await expect(page.getByText('Total notes')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'example.com' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '11' })).toBeVisible()
})
