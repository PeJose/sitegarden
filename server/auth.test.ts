import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'
import { createAuth, hashPassword, verifyPassword } from './auth'
import { openDb } from './core/db'
import type { Graph } from './core/graph'
import type { Secrets } from './core/secrets'

const sha = (s: string) => createHash('sha256').update(s).digest('hex'), DAY = 86_400_000
const PW = 'correct horse', hash = await hashPassword(PW)
let now = 1_000_000_000_000, cfg: Graph['auth'] = { enabled: true, mode: 'tailscale', users: ['Owner@example.com'] }
const env: Record<string, string | undefined> = { SITEGARDEN_API_TOKEN: 'api-token-1' }
const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-auth-')), 'sitegarden.db'), () => now)
const secrets = { value: (n: string) => env[n] } as Secrets // the real store keeps what it read; this one follows `env`
const a = createAuth({ db, secrets, cfg: () => cfg, now: () => now, addr: (c) => c.req.header('x-addr') })
const app = new Hono<{ Variables: { user?: string } }>()
app.use(a.mw)
app.route('/', a.routes)
for (const p of ['/api/x', '/a/x', '/page', '/api/health', '/assets/x.js', '/favicon.svg']) app.get(p, (c) => c.json({ user: c.get('user') ?? null }))
const get = (p: string, headers: Record<string, string> = {}) => app.request(`http://sg.example${p}`, { headers })
const user = async (r: Response) => (await r.json() as { user: string | null }).user
const login = (password: string, headers: Record<string, string> = {}, url = 'https://sg.example/login') => app.request(url, { method: 'POST', body: new URLSearchParams({ password }), headers })
const tok = (r: Response) => /sg_session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1]
const asUser = (t: string) => ({ cookie: `sg_session=${t}` })
const reset = (c: Graph['auth'], hashSet = false) => { cfg = c; env.SITEGARDEN_PASSWORD_HASH = hashSet ? hash : undefined }

test('scrypt hashes verify only the same password, in a fixed format with a fresh salt', async () => {
  assert.match(hash, /^scrypt\$32768\$8\$1\$[\w+/=]+\$[\w+/=]+$/)
  assert.notEqual(hash, await hashPassword(PW))
  assert.deepEqual([await verifyPassword(PW, hash), await verifyPassword('wrong', hash), await verifyPassword('', hash)], [true, false, false])
})

test('a malformed stored hash never verifies', async () => {
  const [, n, r, p, salt] = hash.split('$')
  for (const bad of ['', 'plain', 'scrypt$1$2', `bcrypt$${n}$${r}$${p}$${salt}$AAAA`, `scrypt$${n}$${r}$${p}$${salt}$`, `scrypt$x$${r}$${p}$${salt}$AAAA`, `scrypt$3$${r}$${p}$${salt}$AAAA`]) assert.equal(await verifyPassword(PW, bad), false, bad)
})

test('auth off: every route is open and nobody is identified', async () => {
  reset({ enabled: false, mode: 'tailscale', users: [] })
  assert.deepEqual([(await get('/api/x')).status, await user(await get('/api/x'))], [200, null])
  assert.equal((await get('/login')).headers.get('location'), '/') // no login page when there is nothing to log in to
})

test('tailscale: an allowlisted login (any case) gets in, another gets 403, none gets 401 (page, API and /a/ alike)', async () => {
  reset({ enabled: true, mode: 'tailscale', users: ['Owner@example.com'] })
  const ok = await get('/api/x', { 'Tailscale-User-Login': 'OWNER@example.com' })
  assert.deepEqual([ok.status, await user(ok)], [200, 'OWNER@example.com'])
  const no = await get('/page', { 'Tailscale-User-Login': 'intruder@example.com' })
  assert.deepEqual([no.status, await no.json()], [403, { error: 'forbidden' }])
  assert.equal((await get('/page', { 'Tailscale-User-Login': '' })).status, 403) // present but empty is not "missing"
  for (const p of ['/api/x', '/a/x']) { const r = await get(p); assert.deepEqual([r.status, await r.json()], [401, { error: 'unauthorized' }]) }
  const page = await get('/page')
  assert.deepEqual([page.status, page.headers.get('location'), (await page.text()).startsWith('401')], [401, null, true]) // no password configured: no login page to send them to
  assert.equal((await app.request('http://sg.example/page', { method: 'POST' })).status, 401)
})

test('the Tailscale header means nothing in password mode', async () => {
  reset({ enabled: true, mode: 'password', users: ['owner@example.com'] })
  assert.equal((await get('/api/x', { 'Tailscale-User-Login': 'owner@example.com' })).status, 401)
})

test('bearer token: right one is the api user in either mode, a wrong one is 401 and never falls through', async () => {
  for (const mode of ['tailscale', 'password'] as const) {
    reset({ enabled: true, mode, users: ['owner@example.com'] })
    assert.equal(await user(await get('/api/x', { Authorization: 'Bearer api-token-1' })), 'api')
    assert.equal(await user(await get('/api/x', { authorization: 'bearer api-token-1' })), 'api')
    for (const t of ['api-token-2', '', ' ', 'api-token-1x', 'x'.repeat(10_000)]) assert.equal((await get('/api/x', { Authorization: `Bearer ${t}`, 'Tailscale-User-Login': 'owner@example.com' })).status, 401, t.slice(0, 12))
  }
  const was = env.SITEGARDEN_API_TOKEN
  env.SITEGARDEN_API_TOKEN = undefined
  assert.equal((await get('/api/x', { Authorization: 'Bearer ' })).status, 401) // no token configured: nothing matches
  env.SITEGARDEN_API_TOKEN = was
})

test('open routes need no user; everything else does', async () => {
  reset({ enabled: true, mode: 'tailscale', users: ['owner@example.com'] })
  for (const p of ['/api/health', '/assets/x.js', '/favicon.svg']) assert.equal((await get(p)).status, 200, p)
  for (const p of ['/api/x', '/a/x', '/page']) assert.equal((await get(p)).status, 401, p)
})

test('password login: wrong password is 401 on the form, the right one starts a cookie session of which only a hash is stored', async () => {
  reset({ enabled: true, mode: 'password', users: [] }, true)
  const form = await get('/login')
  assert.deepEqual([form.status, (await form.text()).includes('name=password')], [200, true])
  assert.equal((await get('/page')).headers.get('location'), '/login')
  const wrong = await login('nope', { 'x-addr': '10.0.0.1' })
  assert.deepEqual([wrong.status, (await wrong.text()).includes('Wrong password')], [401, true])
  const ok = await login(PW, { 'x-addr': '10.0.0.1' }), t = tok(ok)!, cookie = ok.headers.get('set-cookie')!
  assert.deepEqual([ok.status, ok.headers.get('location'), t.length], [303, '/', 43])
  for (const f of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Secure', `Max-Age=${30 * 86400}`]) assert.ok(cookie.includes(f), f)
  assert.equal(db.session(t, now), undefined)
  assert.equal(db.session(sha(t), now)?.user, 'owner')
  const r = await get('/api/x', asUser(t))
  assert.deepEqual([r.status, await user(r)], [200, 'owner'])
  assert.equal((await get('/api/x', asUser('bogus'))).status, 401)
})

test('the cookie is not Secure only for plain http to localhost', async () => {
  const flags = async (url: string, h: Record<string, string> = {}) => (await login(PW, { 'x-addr': `9.9.9.${Math.random() * 200 | 0}`, ...h }, url)).headers.get('set-cookie')!.includes('Secure')
  assert.deepEqual([await flags('http://localhost:8787/login'), await flags('http://127.0.0.1:8787/login'), await flags('https://localhost/login'), await flags('http://sg.example/login'), await flags('http://localhost/login', { 'x-forwarded-proto': 'https' })], [false, false, true, true, true])
})

test('sessions last 30 days and slide forward at most once a day; an expired one is refused; logout removes it', async () => {
  const t = tok(await login(PW, { 'x-addr': '10.0.0.2' }))!, exp = () => db.session(sha(t), now)!.expires, start = exp()
  assert.equal(start, now + 30 * DAY)
  now += DAY / 2
  assert.equal((await get('/api/x', asUser(t))).headers.get('set-cookie'), null) // under a day: nothing moves
  assert.equal(exp(), start)
  now += DAY
  const r = await get('/api/x', asUser(t))
  assert.equal(exp(), now + 30 * DAY)
  assert.ok(r.headers.get('set-cookie')!.includes(`sg_session=${t}`)) // the cookie slides with it
  now += 31 * DAY
  assert.equal((await get('/api/x', asUser(t))).status, 401)
  now -= 31 * DAY
  const out = await app.request('http://sg.example/logout', { method: 'POST', headers: asUser(t) })
  assert.deepEqual([out.status, out.headers.get('location'), out.headers.get('set-cookie')!.includes('Max-Age=0')], [303, '/login', true])
  assert.equal(db.session(sha(t), now), undefined)
  assert.equal((await get('/api/x', asUser(t))).status, 401)
})

test('the pruner deletes expired sessions and keeps live ones', () => {
  db.addSession('old', 'owner', now - 1); db.addSession('live', 'owner', now + DAY)
  db.prune(0)
  assert.deepEqual([db.session('old', 0), db.session('live', now)?.user], [undefined, 'owner'])
})

test('a session counts only while a password hash is configured (tailscale mode too)', async () => {
  reset({ enabled: true, mode: 'password', users: [] }, true)
  const t = tok(await login(PW, { 'x-addr': '10.0.0.3' }))!
  reset({ enabled: true, mode: 'tailscale', users: ['owner@example.com'] }, true)
  assert.equal((await get('/api/x', asUser(t))).status, 200) // tagged-device login
  assert.equal((await get('/page')).headers.get('location'), '/login')
})

test('five wrong passwords per client in 15 minutes, then 429 and the password is not even checked; other clients and later are fine', async () => {
  reset({ enabled: true, mode: 'password', users: [] }, true)
  const from = (ip: string) => ({ 'x-addr': ip })
  for (let i = 0; i < 5; i++) assert.equal((await login('nope', from('10.1.1.1'))).status, 401)
  const blocked = await login(PW, from('10.1.1.1')) // the right password, but it is not tried
  assert.deepEqual([blocked.status, blocked.headers.get('set-cookie'), Number(blocked.headers.get('retry-after')) > 0], [429, null, true])
  assert.equal((await login(PW, from('10.1.1.2'))).status, 303)
  now += 16 * 60_000
  assert.equal((await login(PW, from('10.1.1.1'))).status, 303)
})

test('behind the local proxy the client is the first X-Forwarded-For hop; from elsewhere the header is ignored', async () => {
  reset({ enabled: true, mode: 'password', users: [] }, true)
  // behind the local proxy the last hop counts: client-sent first hops cannot dodge the limit
  for (let i = 0; i < 5; i++) await login('nope', { 'x-addr': '127.0.0.1', 'x-forwarded-for': `9.9.9.${i}, 100.64.0.7` })
  assert.equal((await login(PW, { 'x-addr': '127.0.0.1', 'x-forwarded-for': '8.8.8.8, 100.64.0.7' })).status, 429)
  assert.equal((await login(PW, { 'x-addr': '127.0.0.1', 'x-forwarded-for': '100.64.0.8' })).status, 303)
  for (let i = 0; i < 5; i++) await login('nope', { 'x-addr': '10.2.2.2', 'x-forwarded-for': `1.1.1.${i}` })
  assert.equal((await login(PW, { 'x-addr': '10.2.2.2', 'x-forwarded-for': '1.1.1.9' })).status, 429)
})

test('password mode without a configured hash: every login fails and nothing is let in', async () => {
  reset({ enabled: true, mode: 'password', users: [] })
  const warn = console.warn, lines: string[] = []
  console.warn = (m: string) => void lines.push(m)
  try { assert.equal((await login(PW, { 'x-addr': '10.3.3.3' })).status, 401) } finally { console.warn = warn }
  assert.ok(lines.some((l) => l.includes('SITEGARDEN_PASSWORD_HASH is not set')))
  assert.equal((await get('/api/x', asUser('anything'))).status, 401)
})

test('tailscale mode has no login page until a password hash is set', async () => {
  reset({ enabled: true, mode: 'tailscale', users: ['owner@example.com'] })
  assert.deepEqual([(await get('/login')).status, (await login(PW)).status], [404, 404])
})

test('a generated token authenticates by hash until revoked, is not the api user, and last_used moves at most once a minute', async () => {
  reset({ enabled: true, mode: 'password', users: [] }, true)
  const value = 'sg_generated-value', id = db.addToken('ci', sha(value), now), bearer = { Authorization: `Bearer ${value}` }
  assert.equal(await user(await get('/api/x', bearer)), 'token:ci')
  assert.equal(db.tokens()[0].last_used, now)
  const first = now
  now += 30_000
  await get('/api/x', bearer)
  assert.equal(db.tokens()[0].last_used, first) // under a minute: not written again
  now += 31_000
  await get('/api/x', bearer)
  assert.equal(db.tokens()[0].last_used, now)
  assert.equal((await get('/api/x', { Authorization: `Bearer ${sha(value)}` })).status, 401) // the stored hash is not a credential
  assert.equal((await get('/api/x', { Authorization: 'Bearer sg_other' })).status, 401)
  db.removeToken(id)
  assert.equal((await get('/api/x', bearer)).status, 401)
})
