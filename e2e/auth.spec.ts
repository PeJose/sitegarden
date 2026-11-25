import { expect, test } from '@playwright/test'
import { PASSWORD, TOKEN } from './creds'

test('password mode: login page, wrong and right password, API 401 and the bearer token', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByPlaceholder('Password').fill('wrong')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Wrong password')).toBeVisible()
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('img', { name: /^copperleaf\.example: / })).toBeVisible()

  expect((await request.get('/api/status')).status()).toBe(401) // the request fixture has no cookie
  expect((await request.get('/api/status', { headers: { authorization: 'Bearer nope' } })).status()).toBe(401)
  expect((await request.get('/api/status', { headers: { authorization: `Bearer ${TOKEN}` } })).status()).toBe(200)
})

test('a generated token works as a bearer until it is revoked, and cannot manage tokens', async ({ page, request }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('navigation', { name: 'Estates' }).getByRole('button', { name: 'Settings →' }).click()
  const s = page.getByRole('region', { name: 'Settings' })
  await s.getByLabel('Token name').fill('ci')
  await s.getByRole('button', { name: 'Generate' }).click()
  const token = (await s.locator('.once code').textContent())!
  expect(token).toMatch(/^sg_/)
  const bearer = { headers: { authorization: `Bearer ${token}` } }
  expect((await request.get('/api/status', bearer)).status()).toBe(200)
  expect((await request.get('/api/tokens', bearer)).status()).toBe(403)
  await s.locator('.irow', { hasText: 'ci' }).getByRole('button', { name: 'Revoke' }).click()
  await s.getByRole('button', { name: 'yes' }).click()
  await expect(s.locator('.irow', { hasText: 'created' })).toHaveCount(0)
  expect((await request.get('/api/status', bearer)).status()).toBe(401)
})
