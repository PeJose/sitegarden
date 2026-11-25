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
