import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'
import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono, type Context, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Db } from './core/db'
import type { Graph } from './core/graph'
import { log } from './core/log'
import type { Secrets } from './core/secrets'

const kdf = promisify(scrypt) as (pw: string, salt: Buffer, len: number, o: ScryptOptions) => Promise<Buffer>
const N = 2 ** 15, R = 8, P = 1
const opts = (n: number, r: number, p: number) => ({ N: n, r, p, maxmem: 256 * n * r })
// scrypt$N$r$p$salt_b64$key_b64 (scrypt is built into Node; no native dependency)
export async function hashPassword(pw: string) {
  const salt = randomBytes(16), key = await kdf(pw, salt, 64, opts(N, R, P))
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}
// Anything that is not a well-formed hash of this password is false.
export async function verifyPassword(pw: string, stored: string) {
  const f = stored.split('$')
  if (f.length !== 6 || f[0] !== 'scrypt') return false
  try {
    const want = Buffer.from(f[5], 'base64')
    return want.length > 0 && timingSafeEqual(await kdf(pw, Buffer.from(f[4], 'base64'), want.length, opts(Number(f[1]), Number(f[2]), Number(f[3]))), want)
  } catch { return false } // bad parameters
}

const sha = (s: string) => createHash('sha256').update(s)
const same = (a: string, b: string) => timingSafeEqual(sha(a).digest(), sha(b).digest()) // equal-length digests: constant time whatever the input
const COOKIE = 'sg_session', HASH = 'SITEGARDEN_PASSWORD_HASH', DAY = 86_400_000, LIFE = 30 * DAY, WINDOW = 15 * 60_000, TRIES = 5
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const page = (msg = '') => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Sign in</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F1E7;color:#1F1B16;font-family:Outfit,system-ui,sans-serif}@media(prefers-color-scheme:dark){body{background:#121925;color:#EDE6D6}}
form{display:grid;gap:12px;width:min(320px,86vw)}h1{margin:0;font-weight:500}input,button{font:inherit;padding:10px;border:1px solid #B3A792;border-radius:6px;background:transparent;color:inherit}button{cursor:pointer;background:#1F1B16;color:#F5F1EA;border-color:#1F1B16}p{margin:0;color:#A3241D}</style>
<form method=post action=/login><h1>sitegarden</h1>${msg ? `<p>${esc(msg)}</p>` : ''}<input type=password name=password placeholder=Password autocomplete=current-password autofocus required><button>Sign in</button></form>`

export interface AuthDeps { db: Db; secrets: Secrets; cfg: () => Graph['auth']; now?: () => number; addr?: (c: Context) => string | undefined }
// Who is asking, for every request when auth is on (see openspec/changes/m1-deploy-auth/design.md D3-D4). `mw` sets `c.get('user')`; `routes` has /login and /logout.
export function createAuth({ db, secrets, cfg, now = Date.now, addr = (c) => { try { return getConnInfo(c).remote.address } catch { return undefined } } }: AuthDeps) {
  const loginOn = (a: Graph['auth']) => a.mode === 'password' || !!secrets.value(HASH) // tailscale mode has a login page only for tagged devices, once a hash is set
  // shortcut: failed logins are counted in memory, so a restart or a second process resets them; move to the db when running more than one process
  const fails = new Map<string, number[]>()
  const loop = (a?: string) => !!a && (a === '::1' || a.startsWith('127.') || a.startsWith('::ffff:127.'))
  // The socket address; behind the local proxy (tailscale serve) the last X-Forwarded-For hop, the one the proxy added (earlier hops are whatever the client sent).
  const ip = (c: Context) => { const a = addr(c); return loop(a) ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() || a! : a ?? 'unknown' }

  const cookie = (c: Context, token: string) => {
    const u = new URL(c.req.url), proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim() ?? u.protocol.slice(0, -1)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/', secure: !(local && proto !== 'https'), maxAge: LIFE / 1000 })
  }
  function session(c: Context): string | null {
    const token = getCookie(c, COOKIE)
    if (!token || !secrets.value(HASH)) return null // no password configured: no session is honoured
    const id = sha(token).digest('hex'), s = db.session(id, now())
    if (!s) return null
    if (s.expires - now() < LIFE - DAY) { db.extendSession(id, now() + LIFE); cookie(c, token) } // sliding, at most once a day
    return s.user
  }
  // A user name, a ready response (wrong token, unknown tailnet login), or null for nobody.
  function who(c: Context, a: Graph['auth']): string | Response | null {
    const h = c.req.header('authorization')
    if (h && /^bearer(\s|$)/i.test(h)) { const want = secrets.value('SITEGARDEN_API_TOKEN'); return want && same(h.slice(6).trim(), want) ? 'api' : c.json({ error: 'unauthorized' }, 401) } // no fallthrough to other methods
    const login = c.req.header('tailscale-user-login')
    if (a.mode === 'tailscale' && login !== undefined) return a.users.some((u) => u.toLowerCase() === login.toLowerCase()) ? login : c.json({ error: 'forbidden' }, 403)
    return session(c)
  }
  const open = (p: string) => p === '/login' || p === '/logout' || p === '/api/health' || p === '/favicon.svg' || p.startsWith('/assets/')
  const mw = async (c: Context, next: Next) => {
    const a = cfg()
    if (!a.enabled || open(c.req.path)) return next()
    const u = who(c, a)
    if (u instanceof Response) return u
    if (u) { c.set('user', u); return next() }
    const p = c.req.path
    if (c.req.method !== 'GET' || p.startsWith('/api/') || p.startsWith('/a/')) return c.json({ error: 'unauthorized' }, 401)
    return loginOn(a) ? c.redirect('/login') : c.text('401: sign in through Tailscale', 401)
  }

  const routes = new Hono()
  routes.get('/login', (c) => !cfg().enabled ? c.redirect('/') : loginOn(cfg()) ? c.html(page()) : c.text('not found', 404))
  routes.post('/login', bodyLimit({ maxSize: 4096, onError: (c) => c.text('too big', 413) }), async (c) => {
    const a = cfg()
    if (!a.enabled) return c.redirect('/')
    if (!loginOn(a)) return c.text('not found', 404)
    const k = ip(c), t = now(), tries = (fails.get(k) ?? []).filter((x) => t - x < WINDOW)
    if (fails.size > 1000) for (const [x, v] of fails) if (v.every((y) => t - y >= WINDOW)) fails.delete(x)
    if (tries.length >= TRIES) return c.html(page('Too many attempts, try again later'), 429, { 'Retry-After': String(Math.ceil((tries[0] + WINDOW - t) / 1000)) })
    fails.set(k, [...tries, t]) // counted before the slow check, so parallel guesses cannot slip past the limit; forgiven on success
    const hash = secrets.value(HASH), body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
    if (!hash) log.warn(`[auth] ${HASH} is not set: every login fails`)
    if (hash && typeof body.password === 'string' && await verifyPassword(body.password, hash)) {
      fails.set(k, tries)
      const token = randomBytes(32).toString('base64url')
      db.addSession(sha(token).digest('hex'), 'owner', now() + LIFE)
      cookie(c, token)
      return c.redirect('/', 303)
    }
    log.warn(`[auth] failed login from ${k}`)
    return c.html(page('Wrong password'), 401)
  })
  routes.post('/logout', (c) => {
    const token = getCookie(c, COOKIE)
    if (token) db.removeSession(sha(token).digest('hex'))
    deleteCookie(c, COOKIE, { path: '/' })
    return c.redirect(cfg().enabled ? '/login' : '/', 303)
  })
  return { mw, routes }
}
