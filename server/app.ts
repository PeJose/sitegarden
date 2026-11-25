import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import type { ConfigEstate, Positions } from '../src/gen/types'
import { rngFor } from '../src/gen/rng'
import { apply, want } from './apply'
import { computePlan, estimateMs, missing } from './plan'
import { createAuth } from './auth'
import { addEstate, authConfig, bootstrap, canEditConfig, bus, db, forgetPosition, host, latestYaml, loadGraph, loadPositions, removeLastEstate, savePositions, schemaJson, secretWarnings, secrets, toRenderConfig, validate } from './config'
import { eventsHandler } from './core/events'
import { log } from './core/log'
import { ConfigError, diffGraphs, type Graph, type Issue } from './core/graph'
import { DriftError } from './core/db'
import { createHolder } from './core/holder'
import { WORST, createScheduler } from './core/scheduler'
import type { Status } from './core/sdk'
import { makeEstate } from './mock'
import { ART, DATA, RENDERER, currentRelease, has, hash, writeAtomic } from './store'

export const app = new Hono()
app.use(compress())
const auth = createAuth({ db, secrets, cfg: authConfig })
app.use(auth.mw)
app.route('/', auth.routes)
const VERSION = (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8')) as { version: string }).version
app.get('/api/health', (c) => c.json({ ok: true, version: VERSION }, 200, { 'Cache-Control': 'no-store' }))

const guard = async (c: Context, next: Next) => canEditConfig(c) ? next() : c.json({ error: 'config changes need an authorized user' }, 403)

app.get('/schema.json', async (c) => c.json(await schemaJson(latestYaml())))

// What the browser needs to arrange its extensions; nothing secret.
app.get('/api/config', (c) => c.json({ extensions: graph.get()?.extensions ?? {}, plugins: host.plugins().filter((p) => p.status === 'loaded').map((p) => p.id) }, 200, { 'Cache-Control': 'no-cache' }))

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

// A client that renders locally asks which artifacts the server lacks, then uploads them. Names are input hashes, so the content is trusted, not checked: only for authorized clients.
const NAME = /^[\w-][\w.-]*$/, CAP = 20 * 1024 * 1024
app.post('/api/artifacts/missing', guard, async (c) => {
  const b = (await c.req.json().catch(() => null)) as { names?: unknown } | null
  if (!Array.isArray(b?.names) || !b.names.every((n) => typeof n === 'string' && NAME.test(n))) return c.json({ error: 'need names' }, 400)
  return c.json({ missing: b.names.filter((n) => !has(n)) })
})
app.put('/a/:file', guard, bodyLimit({ maxSize: CAP, onError: (c) => c.json({ error: 'too big' }, 413) }), async (c) => {
  const f = c.req.param('file') ?? ''
  if (!NAME.test(f)) return c.json({ error: 'bad name' }, 400)
  writeAtomic(path.join(ART, f), Buffer.from(await c.req.arrayBuffer()))
  return c.json({ ok: true })
})

// A client tells which tiles it is waiting for (visible, not rendered yet); the running apply renders those next and the release event brings them.
app.post('/api/want', async (c) => {
  const b = (await c.req.json().catch(() => null)) as { theme?: string; tiles?: unknown } | null
  if (!b || (b.theme !== 'light' && b.theme !== 'night') || !Array.isArray(b.tiles)) return c.json({ error: 'need theme and tiles' }, 400)
  want(b.tiles.filter((t): t is [number, number, number] => Array.isArray(t) && t.length === 3 && t.every(Number.isInteger)).map(([z, x, y]) => `${b.theme}/${z}/${x}/${y}`))
  return c.json({ ok: true })
})

app.use('/api/apply', guard)
app.use('/api/estates*', guard)

// Config changes are validated and stored as the next revision on top of `base`; the running graph and the map follow.
async function commit(yaml: string, source: string, base = db.latestRev(), positions?: Positions) {
  await validate(yaml)
  const rev = db.storeRev(base, yaml, source)
  if (positions) savePositions(positions) // before the render starts: it must see the positions the client rendered with
  bus.emit('config.applied', { rev, source })
  await reloaded()
  return rev
}
app.onError((e, c) => e instanceof DriftError ? c.json({ error: 'drift', rev: e.latest }, 409) : e instanceof ConfigError ? c.json({ error: 'invalid config', issues: rejected(e.message, e.issues) }, 422) : (log.error(e), c.text('internal error', 500)))

const clean = (issues: Issue[]) => issues.map((i) => ({ ...i, message: secrets.redact(i.message) }))
// A rejected plan, apply or GUI edit is reported like a failed reload: the log and a config.invalid event.
const rejected = (message: string, issues: Issue[]) => { log.error(`[config] rejected:\n${secrets.redact(message)}`); bus.emit('config.invalid', { message, issues }); return clean(issues) }
// Validation result for a candidate config: the graph, or every issue with its line.
async function check(yaml: string): Promise<{ graph: Graph } | { issues: Issue[] }> {
  try {
    return { graph: await validate(yaml) }
  } catch (e) { if (e instanceof ConfigError) return { issues: rejected(e.message, e.issues) }; throw e }
}
const planId = (baseRev: number, yaml: string) => hash(`${baseRev}:${yaml}`)
const planBody = async (c: Context) => {
  const b = (await c.req.json().catch(() => null)) as { yaml?: unknown; baseRev?: unknown } | null
  return typeof b?.yaml === 'string' && Number.isInteger(b.baseRev) ? { yaml: b.yaml, baseRev: b.baseRev as number } : null
}

// Nothing changes: the candidate is validated and compared with the latest revision.
app.post('/api/plan', async (c) => {
  const b = await planBody(c), rev = db.latestRev()
  if (!b) return c.json({ error: 'need yaml and baseRev' }, 400)
  if (b.baseRev !== rev) return c.json({ error: 'drift', rev }, 409)
  const r = await check(b.yaml)
  if ('issues' in r) return c.json({ rev, ok: false, issues: r.issues })
  const plan = computePlan(toRenderConfig(r.graph), loadPositions()), todo = missing(plan)
  return c.json({ rev, ok: true, warnings: secretWarnings(r.graph), diff: diffGraphs(await validate(latestYaml()), r.graph), render: todo.tiles.length ? { jobs: todo.jobs.length, tiles: todo.tiles.length, ms: estimateMs(todo.jobs, todo.tiles.length) } : { jobs: 0, tiles: 0, ms: 0 }, planId: planId(rev, b.yaml), release: plan.id })
})

app.get('/api/state', (c) => c.json({ rev: db.latestRev(), yaml: latestYaml(), renderer: RENDERER, positions: loadPositions() }, 200, { 'Cache-Control': 'no-store' }))

// The CLI applies exactly what it planned: the plan id is a hash of the base rev and the YAML.
app.post('/api/apply', async (c) => {
  const b = (await c.req.json().catch(() => null)) as { yaml?: unknown; baseRev?: unknown; planId?: unknown; render?: unknown; positions?: unknown } | null
  if (typeof b?.yaml !== 'string' || !Number.isInteger(b.baseRev) || (b.render !== 'server' && b.render !== 'client')) return c.json({ error: 'need yaml, baseRev, planId and render' }, 400)
  const base = b.baseRev as number, rev = db.latestRev()
  if (base !== rev) return c.json({ error: 'drift', rev }, 409)
  if (b.planId !== planId(base, b.yaml)) return c.json({ error: 'plan id does not match the yaml and base rev' }, 400)
  const r = await check(b.yaml)
  if ('issues' in r) return c.json({ error: 'invalid config', issues: r.issues }, 422)
  // Comments are config content: only identical text is unchanged; a comment-only edit is stored as a new rev.
  if (b.yaml.trim() === latestYaml().trim()) return c.json({ unchanged: true, rev })
  return c.json({ rev: await commit(b.yaml, 'cli', base, b.render === 'client' && b.positions && typeof b.positions === 'object' ? (b.positions as Positions) : undefined) })
})

app.post('/api/estates', async (c) => {
  // An explicit estate in the body is planted as given; an empty body plants a random one.
  const body = (await c.req.json().catch(() => null)) as ConfigEstate | null
  const taken = (graph.get()?.groups ?? []).map((x) => x.id)
  if (body && (typeof body.id !== 'string' || !Array.isArray(body.nodes) || taken.includes(body.id))) return c.json({ error: 'need a new id and nodes' }, 400)
  const e = body ?? makeEstate(rngFor('plant', Date.now(), Math.random()), taken)
  await commit(addEstate(latestYaml(), e), 'gui')
  return c.json({ id: e.id, nodes: e.nodes.length })
})
app.delete('/api/estates/last', async (c) => {
  const r = removeLastEstate(latestYaml())
  if (!r) return c.json({ error: 'only one estate left' }, 409)
  await commit(r.yaml, 'gui')
  forgetPosition(r.id)
  return c.json({ id: r.id })
})

// Typed events with stored IDs (see core/events.ts). `release` is emitted whenever `current` moves (this process, or `pnpm sg apply` in another).
const key = (r: ReturnType<typeof currentRelease>) => r && `${r.id}:${r.rev}`
app.get('/api/events', eventsHandler(bus, () => key(currentRelease())))
const graph = createHolder(() => loadGraph(latestYaml()), bus.emit)
export const scheduler = createScheduler({ db, emit: bus.emit, redact: secrets.redact })
app.post('/api/refresh', async (c) => {
  const b = (await c.req.json().catch(() => null)) as { node?: unknown } | null
  if (b?.node !== undefined && typeof b.node !== 'string') return c.json({ error: 'node must be a node id' }, 400)
  return c.json({ ok: true, queued: scheduler.refresh(b?.node as string | undefined) })
})
// The map's statuses in one read; `lastEventId` comes first so an event emitted meanwhile is replayed by the client, never lost.
const worstOf = (s: string[]) => s.sort((a, b) => WORST.indexOf(a as Status) - WORST.indexOf(b as Status))[0]
app.get('/api/status', (c) => {
  const lastEventId = db.lastEventId(), live = scheduler.active(), snaps = db.snapshots().filter((s) => live.has(`${s.check_id}@${s.node}`)), nodes: Record<string, unknown> = {}
  for (const n of graph.get()?.nodes ?? []) {
    const own = snaps.filter((s) => s.node === n.id), rows = db.history(n.id, 500).filter((r) => live.has(`${r.check_id}@${n.id}`)) // a check removed from the config no longer counts
    const status = own.length ? worstOf(own.map((s) => s.status)) : 'unknown', by = new Map<string, string>()
    let since: number | null = null, run = ''
    for (const r of rows) { // replay: the node's status after each result, then the start of the run it ends in
      by.set(r.check_id, r.status)
      const now = worstOf([...by.values()])
      if (now !== run) { run = now; since = r.at }
    }
    const withMs = own.filter((s) => s.ms !== null).sort((a, b) => b.at - a.at)[0]
    nodes[n.id] = {
      status, since: own.length ? since : null, lastChecked: own.length ? Math.max(...own.map((s) => s.at)) : null,
      responseMs: withMs && withMs.status === 'ok' ? withMs.ms : null,
      history: rows.filter((r) => r.ms !== null || r.status !== 'ok').slice(-48).map((r) => r.status === 'ok' ? r.ms! : 0),
      checks: own.map((s) => ({ id: s.check_id, status: s.status, detail: s.detail, at: s.at, ms: s.ms })),
    }
  }
  return c.json({ lastEventId, demo: host.plugins().some((p) => p.id === 'mock' && p.status === 'loaded'), nodes }, 200, { 'Cache-Control': 'no-store' })
})
let last = key(currentRelease())
const debounce = (ms: number, f: () => void) => { let t: ReturnType<typeof setTimeout>; return () => { clearTimeout(t); t = setTimeout(f, ms) } }

// Apply on startup (a no-op when the current release already matches) and after every config change.
export const engine = { apply } // swapped for a stub in tests
let running = false, again = false, lastProgress = 0
const progress = (done: number, total: number) => { // about four a second, plus the last one
  if (done < total && Date.now() - lastProgress < 250) return
  lastProgress = Date.now()
  bus.emit('apply.progress', { rev: db.latestRev(), done, total })
}
async function runApply() {
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      const s = await engine.apply((m) => log.info(`[apply] ${m}`), () => again, progress)
      log.info(`[apply] ${s.aborted ? 'superseded' : 'done'} in ${s.ms} ms`, s.rendered)
    } while (again)
  } catch (e) {
    log.error('[apply] failed, still serving the previous release:', (e as Error).message)
    bus.emit('apply.failed', { rev: db.latestRev(), message: (e as Error).message }) // the CLI is waiting for this rev
  } finally { running = false }
}
// A good reload re-plans the checks (plugins were reloaded first) and re-renders.
const reloaded = () => graph.reload().then((ok) => { if (ok) { secretWarnings(graph.get()!).forEach((w) => log.warn(`[secrets] ${w.message}`)); scheduler.set(graph.get()!.nodes, host.checks(), host.configured(graph.get()!.nodes)); void runApply() } })

// Built web app next to the API; hashed files under /assets never change, the page itself is always revalidated. Unknown page paths get the app (client-side routes).
const WEB = path.resolve(process.env.SITEGARDEN_WEB ?? path.join(import.meta.dirname, '../dist'))
const found = (file: string, c: Context) => void c.set('cache', file.startsWith(path.join(WEB, 'assets') + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache')
const web = (h: MiddlewareHandler): MiddlewareHandler => async (c, next) => { const r = await h(c, next), cc = c.get('cache'); if (r instanceof Response && cc) r.headers.set('Cache-Control', cc); return r } // the response exists before onFound runs
const files = web(serveStatic({ root: WEB, onFound: found })), spa = web(serveStatic({ root: WEB, path: 'index.html', onFound: found }))
app.get('*', files)
app.get('*', (c, next) => /^\/(api|a|assets)\//.test(c.req.path) || path.extname(c.req.path) ? next() : spa(c, next))

// Off this machine, auth off exposes everything, and tailscale mode trusts a header anyone on the network could send: only `tailscale serve` on loopback may set it.
export function listenIssue(addr: string, a: { enabled: boolean; mode: string }, insecure: boolean) {
  if (insecure || addr === 'localhost' || addr === '::1' || addr === '[::1]' || /^127\./.test(addr)) return null
  if (!a.enabled) return `refusing to listen on ${addr} with auth off: turn auth on, or set SITEGARDEN_INSECURE=1 to accept the risk`
  return a.mode === 'tailscale' ? `refusing to listen on ${addr} in tailscale auth mode: the Tailscale-User-Login header is only trustworthy on loopback behind tailscale serve; use HOST=127.0.0.1, password mode, or SITEGARDEN_INSECURE=1` : null
}
export function start(port: number, addr = '127.0.0.1') {
  bootstrap()
  const issue = listenIssue(addr, authConfig(), process.env.SITEGARDEN_INSECURE === '1')
  if (issue) return Promise.reject(new Error(issue))
  const watcher = fs.watch(DATA, debounce(30, () => { const k = key(currentRelease()); if (k && k !== last) { last = k; bus.emit('release', k) } }))
  return new Promise<{ port: number; close(): void }>((resolve) => {
    const server = serve({ fetch: app.fetch, port, hostname: addr }, (i) => {
      log.info(`[server] http://localhost:${i.port}`)
      void reloaded()
      resolve({ port: i.port, close: () => { watcher.close(); scheduler.stop(); server.close() } })
    })
  })
}
