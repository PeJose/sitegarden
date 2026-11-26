import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

declare global { interface Window { __sgTiles?: { drawn: number } } }

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

// The engine pushes the centre pixel's alpha into window.__sgAlpha after every draw (paper, preview and tiles are opaque); a WebGL canvas cannot be read between frames.

test('the tile canvas draws tiles, and zooming in and out never leaves the pane blank, with the DOM layers in the canvas\'s view every frame', async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto('/')
  await expect(page.locator('canvas.tiles')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__sgTiles?.drawn ?? 0), { timeout: 60_000 }).toBeGreaterThan(0)
  await page.evaluate(`window.__sgAlpha = []; window.__bad = []; (function f() {
    const t = window.__sgTiles, w = document.querySelector('.world').style.transform, p = document.querySelector('.pane .viewport').style.transform
    const n = (s) => s.match(/-?[\\d.]+(e-?\\d+)?/g).map(Number), want = [t.view.x, t.view.y, t.view.zoom] // the style rounds to 6 digits
    if (![w, p].every((s) => n(s).every((v, i) => Math.abs(v - want[i]) < 1e-2))) window.__bad.push([w, p, want])
    requestAnimationFrame(f)
  })()`)
  await page.mouse.move(900, 400) // right of the hero panel
  const wheel = async (dy: number, n: number) => { for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(40) } }
  await wheel(-300, 8) // in
  await page.waitForTimeout(500)
  await wheel(300, 12) // all the way out
  await page.waitForTimeout(300)
  const { alpha, bad } = await page.evaluate(() => { const w = window as unknown as { __sgAlpha: number[]; __bad: unknown[] }; return { alpha: w.__sgAlpha, bad: w.__bad } })
  expect(alpha.length).toBeGreaterThan(20)
  expect(alpha.filter((a) => a !== 255)).toEqual([])
  expect(bad).toEqual([])
})
