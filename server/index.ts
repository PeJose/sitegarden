import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { streamSSE } from 'hono/streaming'
import type { ConfigEstate } from '../src/gen/types'
import { rngFor } from '../src/gen/rng'
import { apply, want } from './apply'
import { addEstate, CONFIG_FILE, loadConfig, removeLastEstate } from './config'
import { makeEstate } from './mock'
import { ART, DATA, currentRelease } from './store'

const app = new Hono()
app.use(compress())

app.get('/api/release', (c) => {
  const r = currentRelease()
  return r ? c.json(r, 200, { 'Cache-Control': 'no-cache' }) : c.json({ pending: true }, 503, { 'Cache-Control': 'no-store' })
})

// Content-addressed files (tiles, previews, world JSON): the name is the hash, so they never change.
const TYPE: Record<string, string> = { webp: 'image/webp', json: 'application/json', png: 'image/png' }
app.get('/a/:file', (c) => {
  const f = c.req.param('file')
  const file = path.join(ART, f)
  if (!/^[\w.-]+$/.test(f) || !fs.existsSync(file)) return c.text('not found', 404)
  return c.body(fs.readFileSync(file), 200, { 'Content-Type': TYPE[f.split('.').pop()!] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' })
})

// A client tells which tiles it is waiting for (visible, not rendered yet); the running apply renders those next and the release event brings them.
app.post('/api/want', async (c) => {
  const b = (await c.req.json().catch(() => null)) as { theme?: string; tiles?: unknown } | null
  if (!b || (b.theme !== 'light' && b.theme !== 'night') || !Array.isArray(b.tiles)) return c.json({ error: 'need theme and tiles' }, 400)
  want(b.tiles.filter((t): t is [number, number, number] => Array.isArray(t) && t.length === 3 && t.every(Number.isInteger)).map(([z, x, y]) => `${b.theme}/${z}/${x}/${y}`))
  return c.json({ ok: true })
})

// The GUI only edits sitegarden.yaml; the file watcher below applies it.
app.post('/api/estates', async (c) => {
  // An explicit estate in the body is planted as given; an empty body plants a random one.
  const body = (await c.req.json().catch(() => null)) as ConfigEstate | null
  const taken = loadConfig().estates.map((x) => x.id)
  if (body && (typeof body.id !== 'string' || !Array.isArray(body.nodes) || taken.includes(body.id))) return c.json({ error: 'need a new id and nodes' }, 400)
  const e = body ?? makeEstate(rngFor('plant', Date.now(), Math.random()), taken)
  addEstate(e)
  return c.json({ id: e.id, nodes: e.nodes.length })
})
app.delete('/api/estates/last', (c) => {
  const id = removeLastEstate()
  return id ? c.json({ id }) : c.json({ error: 'only one estate left' }, 409)
})

// Server-sent events: one `release` event whenever `current` moves (this process, or `pnpm sg apply` in another).
const listeners = new Set<(id: string) => void>()
app.get('/api/events', (c) => streamSSE(c, async (s) => {
  const send = (key: string) => void s.writeSSE({ event: 'release', data: key })
  listeners.add(send)
  s.onAbort(() => void listeners.delete(send))
  const r = currentRelease()
  if (r) send(`${r.id}:${r.rev}`)
  while (!s.aborted) await s.sleep(25_000).then(() => s.writeSSE({ event: 'ping', data: '' })) // keeps proxies from closing an idle stream
}))
let last = ((r) => r && `${r.id}:${r.rev}`)(currentRelease())
const debounce = (ms: number, f: () => void) => { let t: ReturnType<typeof setTimeout>; return () => { clearTimeout(t); t = setTimeout(f, ms) } }
fs.watch(DATA, debounce(30, () => { const r = currentRelease(); const k = r && `${r.id}:${r.rev}`; if (r && k !== last) { last = k; listeners.forEach((f) => f(k!)) } }))

// Apply on startup (a no-op when the current release already matches) and whenever the config file changes.
let running = false, again = false
async function runApply() {
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      const s = await apply((m) => console.log(`[apply] ${m}`), () => again)
      console.log(`[apply] ${s.aborted ? 'superseded' : 'done'} in ${s.ms} ms`, s.rendered)
    } while (again)
  } catch (e) { console.error('[apply] failed, still serving the previous release:', (e as Error).message) } finally { running = false }
}
const reapply = debounce(100, () => void runApply())
fs.watch(path.dirname(CONFIG_FILE), (_, f) => { if (f === path.basename(CONFIG_FILE)) reapply() })

const port = 8787
serve({ fetch: app.fetch, port }, () => {
  console.log(`[server] http://localhost:${port}`)
  void runApply()
})
