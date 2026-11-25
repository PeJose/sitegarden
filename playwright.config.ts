import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

// Ports and data dirs are picked once here; the workers inherit them through the environment. Run `pnpm build` first: the servers serve dist/.
// shortcut: a random port in 20000-40000 can collide with a busy one, rerun when it does
process.env.E2E_PORT ??= String(20000 + Math.floor(Math.random() * 20000))
process.env.E2E_DATA ??= mkdtempSync(path.join(os.tmpdir(), 'sg-e2e-'))
const port = Number(process.env.E2E_PORT), authPort = port + 1
const server = (cmd: string, p: number, config: string) => ({
  command: `pnpm exec tsx ${cmd}`,
  url: `http://127.0.0.1:${p}/api/health`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: { PORT: String(p), HOST: '127.0.0.1', SITEGARDEN_DATA: path.join(process.env.E2E_DATA!, String(p)), SITEGARDEN_CONFIG: path.resolve('e2e', config) },
})

export default defineConfig({
  testDir: 'e2e',
  expect: { timeout: 30_000 },
  workers: 1,
  timeout: 90_000, // the first map render waits for the server to draw the world
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { headless: true, serviceWorkers: 'block' },
  projects: [
    { name: 'app', testMatch: 'app.spec.ts', use: { browserName: 'chromium', baseURL: `http://127.0.0.1:${port}` } },
    { name: 'auth', testMatch: 'auth.spec.ts', use: { browserName: 'chromium', baseURL: `http://127.0.0.1:${authPort}` } },
  ],
  webServer: [server('server/index.ts', port, 'sitegarden.yaml'), server('e2e/auth-server.ts', authPort, 'sitegarden.auth.yaml')],
})
