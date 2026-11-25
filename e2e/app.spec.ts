import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const pins = (p: import('@playwright/test').Page) => p.getByRole('img', { name: /^(acme\/fernhill|fernhill\.example|copperleaf\.example): / })

test('the map loads with its pins and the status strip', async ({ page }) => {
  await page.goto('/')
  await expect(pins(page)).toHaveCount(3)
  await expect(page.getByRole('navigation', { name: 'Estates' })).toContainText('fernhill')
  await expect(page.locator('.strip')).toContainText(/all well|checked/)
})

test('a node gets a status from the server within 10 s', async ({ page }) => {
  await page.goto('/')
  await expect(pins(page).first()).toBeVisible()
  await expect(page.getByRole('img', { name: /^fernhill\.example: (ok|degraded|down|working)$/ })).toBeVisible({ timeout: 10_000 })
})

test('Check now posts /api/refresh and a newer check comes back', async ({ page, request }) => {
  const last = async () => (await (await request.get('/api/status')).json()).nodes['fernhill-site'].lastChecked as number
  await page.goto('/?select=fernhill-site')
  const before = await last()
  const refresh = page.waitForRequest((r) => r.url().endsWith('/api/refresh') && r.method() === 'POST')
  await page.getByRole('complementary', { name: 'fernhill.example details' }).getByRole('button', { name: 'Check now' }).click()
  expect(JSON.parse((await refresh).postData() ?? '{}')).toEqual({ node: 'fernhill-site' })
  await expect.poll(last, { timeout: 10_000 }).toBeGreaterThan(before)
})

test('a node without a mock block opens its details', async ({ page }) => {
  await page.goto('/?select=fernhill-repo')
  await expect(page.getByRole('complementary', { name: 'acme/fernhill details' })).toBeVisible()
})

test('the hero menu opens the Checks tab from the essentials web plugin', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Estates' }).getByRole('button', { name: 'Checks →' }).click()
  const sheet = page.getByRole('region', { name: 'Checks' })
  await expect(sheet.getByRole('button', { name: /fernhill\.example mock/ })).toContainText(/ok|degraded|down/, { timeout: 10_000 })
})

test('Settings opens from the hero menu with the version and plugins, Esc returns to the map, and the map has no mock tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^mock/ })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Estates' }).getByRole('button', { name: 'Settings →' }).click()
  const s = page.getByRole('region', { name: 'Settings' })
  await expect(page).toHaveURL(/\/settings$/)
  await expect(s).toContainText(JSON.parse(readFileSync('package.json', 'utf8')).version)
  await expect(s.locator('.irow', { hasText: 'essentials' })).toContainText('loaded')
  await expect(s.getByRole('button', { name: 'deploy now' })).toBeVisible() // the fixture loads the mock plugin: demo mode
  await page.keyboard.press('Escape')
  await expect(s).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})
