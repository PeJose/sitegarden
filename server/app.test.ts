import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-app-'))
process.env.SITEGARDEN_DATA = dir // before store.ts and config.ts load
process.env.SITEGARDEN_CONFIG = path.join(dir, 'sitegarden.yaml')
const root = path.join(import.meta.dirname, '..')
const base = `world: { seed: t }
plugins: ['${root}/plugins/essentials']
groups:
  - { id: g1, label: g1 }
nodes:
  - { id: a, type: repo, group: g1 }
  - { id: b, type: site, group: g1 }
edges:
  - { from: a, to: b, type: deploy }
`
process.env.SG_TEST_TOKEN = 'tok-abcdef123'
fs.writeFileSync(process.env.SITEGARDEN_CONFIG, base)
const { app } = await import('./app')
const { auth, bootstrap, db } = await import('./config')
bootstrap()

const post = (url: string, body: unknown) => app.request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const json = async (r: Response | Promise<Response>) => { const x = await r; return [x.status, await x.json()] as [number, any] }

test('plan lists a new node and the tiles to render, and stores nothing', async () => {
  const [s, p] = await json(post('/api/plan', { yaml: base.replace('edges:', '  - { id: c, type: repo, group: g1 }\nedges:'), baseRev: 1 }))
  assert.equal(s, 200)
  assert.equal(p.ok, true)
  assert.deepEqual(p.diff, [{ kind: 'node', op: '+', id: 'c' }])
  assert.ok(p.render.tiles > 0 && p.planId && p.release)
  assert.equal(db.latestRev(), 1)
})

test('plan reports every issue with its line', async () => {
  const [, p] = await json(post('/api/plan', { yaml: base + 'edges2: 1\n', baseRev: 1 }))
  assert.equal(p.ok, false)
  assert.ok(p.issues.length && p.issues[0].line > 0)
  const [, q] = await json(post('/api/plan', { yaml: base.replace('to: b', 'to: nope'), baseRev: 1 }))
  assert.match(q.issues[0].message, /no node with that id/)
  assert.equal(q.issues[0].line, 9)
})

test('plan on a stale base is a drift 409 naming the latest rev', async () => {
  const [s, p] = await json(post('/api/plan', { yaml: base, baseRev: 0 }))
  assert.deepEqual([s, p], [409, { error: 'drift', rev: 1 }])
  assert.equal((await post('/api/plan', { yaml: 5 })).status, 400)
})

test('an unchanged config plans to nothing', async () => {
  const [, p] = await json(post('/api/plan', { yaml: base, baseRev: 1 }))
  assert.deepEqual(p.diff, [])
})

test('plan warns about a declared secret with no value, and an undeclared reference is a line error', async () => {
  const yaml = base.replace('groups:', 'secrets:\n  SG_TEST_UNSET: {}\ngroups:')
  const [, p] = await json(post('/api/plan', { yaml, baseRev: 1 }))
  assert.deepEqual(p.warnings, [{ secret: 'SG_TEST_UNSET', message: 'secret SG_TEST_UNSET is not set' }])
  const [, q] = await json(post('/api/plan', { yaml: base.replace('type: repo,', 'type: repo, name: "${secret:SG_NOPE}",'), baseRev: 1 }))
  assert.deepEqual([q.ok, q.issues[0].line, q.issues[0].message], [false, 6, 'secret SG_NOPE is not declared under secrets:'])
})

const { engine } = await import('./app')
engine.apply = async () => ({ rendered: {}, tiles: 0, ms: 0, first: 0, aborted: false }) // no rendering in these tests
const apply = async (yaml: string, o: Record<string, unknown> = {}) => {
  const baseRev = db.latestRev()
  return json(post('/api/apply', { yaml, baseRev, planId: hash(`${baseRev}:${yaml}`), render: 'server', ...o }))
}
const { hash } = await import('./store')
const withNode = (id: string) => base.replace('edges:', `  - { id: ${id}, type: repo, group: g1 }\nedges:`)

test('apply stores the next rev, emits config.applied and serves it from /api/state', async () => {
  const [s, r] = await apply(withNode('c'))
  assert.deepEqual([s, r], [200, { rev: 2 }])
  assert.deepEqual([db.getRev(2)?.source, db.getRev(2)?.yaml], ['cli', withNode('c')])
  assert.deepEqual(db.eventsAfter(0).filter((e) => e.type === 'config.applied').map((e) => e.data), [{ rev: 2, source: 'cli' }])
  const [, st] = await json(app.request('/api/state'))
  assert.deepEqual([st.rev, st.yaml, st.renderer], [2, withNode('c'), 'r8'])
})

test('a plan id that does not match what is sent is rejected', async () => {
  const [s] = await apply(withNode('d'), { planId: 'nope' })
  assert.equal(s, 400)
  assert.equal(db.latestRev(), 2)
})

test('an invalid config is rejected with its issues and stores nothing', async () => {
  const [s, r] = await apply(withNode('c').replace('to: b', 'to: nope'))
  assert.equal(s, 422)
  assert.equal(r.issues[0].line, 10)
  assert.equal(db.latestRev(), 2)
})

test('a rejected apply, plan or GUI edit emits config.invalid with the issues', async () => {
  const seen = () => db.eventsAfter(0).filter((e) => e.type === 'config.invalid') as { data: { message: string; issues: { line: number }[] } }[]
  const n = seen().length
  await apply(withNode('c').replace('to: b', 'to: nope'))
  assert.equal(seen().length, n + 1)
  assert.deepEqual([seen()[n].data.issues[0].line, /nope/.test(seen()[n].data.message)], [10, true])
  await json(post('/api/plan', { yaml: withNode('c').replace('type: site', 'type: spaceship'), baseRev: db.latestRev() }))
  assert.match(seen()[n + 1].data.message, /unknown node type "spaceship"/)
  const [s] = await json(post('/api/estates', { id: 'bad', label: 'bad', nodes: [{ id: 'z', type: 'spaceship' }], edges: [] }))
  assert.equal(s, 422)
  assert.equal(seen().length, n + 3)
  assert.equal(db.latestRev(), 2)
})

test('the same text again is "unchanged"; a comment-only edit is a new rev', async () => {
  assert.deepEqual(await apply(withNode('c')), [200, { unchanged: true, rev: 2 }])
  assert.deepEqual(await apply(withNode('c') + '\n'), [200, { unchanged: true, rev: 2 }])
  assert.deepEqual(await apply(withNode('c') + '# note\n'), [200, { rev: 3 }])
})

test('two applies on the same base: one becomes the next rev, the other is a drift 409', async () => {
  const baseRev = db.latestRev(), send = (id: string) => json(post('/api/apply', { yaml: withNode(id), baseRev, planId: hash(`${baseRev}:${withNode(id)}`), render: 'server' }))
  const res = await Promise.all([send('e'), send('f')])
  assert.deepEqual(res.map((r) => r[0]).sort(), [200, 409])
  assert.deepEqual(res.find((r) => r[0] === 409)![1], { error: 'drift', rev: 4 })
  assert.equal(db.latestRev(), 4)
})

test('a stale base on apply is a drift 409', async () => {
  const [s, r] = await apply(withNode('g'), { baseRev: 1 })
  assert.deepEqual([s, r], [409, { error: 'drift', rev: 4 }])
})

const estate = { id: 'zeta', label: 'zeta', nodes: [{ id: 'zeta-repo', type: 'repo' }], edges: [] }

test('planting and removing an estate in the GUI make revs with source gui', async () => {
  const before = db.latestRev()
  assert.deepEqual((await json(post('/api/estates', estate)))[1], { id: 'zeta', nodes: 1 })
  assert.deepEqual([db.latestRev(), db.getRev(before + 1)?.source], [before + 1, 'gui'])
  assert.match(db.getRev(before + 1)!.yaml, /id: zeta/)
  const [s, r] = await json(app.request('/api/estates/last', { method: 'DELETE' }))
  assert.deepEqual([s, r, db.getRev(before + 2)?.source], [200, { id: 'zeta' }, 'gui'])
  assert.equal((await json(post('/api/estates', { ...estate, id: 'g1' })))[0], 400)
})

const put = (name: string, body: string | Buffer) => app.request(`/a/${name}`, { method: 'PUT', body })

test('artifact upload checks the name and the size, and missing lists what the server lacks', async () => {
  assert.equal((await put('tile-abc.webp', 'x')).status, 200)
  assert.equal(fs.readFileSync(path.join(dir, 'a/tile-abc.webp'), 'utf8'), 'x')
  for (const n of ['.hidden', 'a$b']) assert.equal((await put(n, 'x')).status, 400, n)
  assert.equal((await put('big.webp', Buffer.alloc(20 * 1024 * 1024 + 1))).status, 413)
  assert.equal(fs.existsSync(path.join(dir, 'a/big.webp')), false)
  const chunked = new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(20 * 1024 * 1024 + 1)); c.close() } }) // no Content-Length
  assert.equal((await app.request('/a/big2.webp', { method: 'PUT', body: chunked, duplex: 'half' } as RequestInit)).status, 413)
  assert.equal(fs.existsSync(path.join(dir, 'a/big2.webp')), false)
  assert.deepEqual((await json(post('/api/artifacts/missing', { names: ['tile-abc.webp', 'tile-zzz.webp'] })))[1], { missing: ['tile-zzz.webp'] })
  assert.equal((await json(post('/api/artifacts/missing', { names: ['../x'] })))[0], 400)
})

test('enabling auth is a 422 on the auth.enabled line while no auth provider exists', async () => {
  const rev = db.latestRev(), yaml = withNode('c') + 'auth: { enabled: true }\n'
  const [s, r] = await apply(yaml)
  assert.deepEqual([s, r.issues], [422, [{ line: yaml.split('\n').length - 1, path: 'auth.enabled', message: 'auth is not available yet (M1 item 5)' }]])
  assert.equal(db.latestRev(), rev)
})

test('an apply error that echoes a secret is stored and logged as [secret:NAME]', async () => {
  const real = engine.apply, lines: string[] = [], err = console.error
  engine.apply = async () => { throw new Error('upstream said: bad token tok-abcdef123') }
  console.error = (m: string) => void lines.push(m)
  try {
    assert.equal((await apply(db.getRev(db.latestRev())!.yaml + 'secrets:\n  SG_TEST_TOKEN: {}\n'))[0], 200)
    await new Promise((r) => setTimeout(r, 50))
  } finally { engine.apply = real; console.error = err }
  assert.deepEqual(db.eventsAfter(0).filter((e) => e.type === 'apply.failed').map((e: any) => e.data.message), ['upstream said: bad token [secret:SG_TEST_TOKEN]'])
  assert.ok(lines.some((l) => l.includes('[secret:SG_TEST_TOKEN]')) && !lines.some((l) => l.includes('tok-abcdef123')))
})

test('with auth enabled, apply and GUI edits are refused and no rev is made', async () => {
  auth.provider = true // stub: the provider exists, so the config may turn auth on
  const [s] = await apply(db.getRev(db.latestRev())!.yaml + 'auth: { enabled: true }\n')
  assert.equal(s, 200) // the change that turns it on is the last one
  const rev = db.latestRev()
  assert.equal((await apply(withNode('h')))[0], 403)
  assert.equal((await json(post('/api/estates', estate)))[0], 403)
  assert.equal((await put('tile-nope.webp', 'x')).status, 403)
  assert.equal((await json(post('/api/artifacts/missing', { names: [] })))[0], 403)
  assert.equal((await json(app.request('/api/estates/last', { method: 'DELETE' })))[0], 403)
  assert.equal(db.latestRev(), rev)
})

const nap = () => new Promise((r) => setTimeout(r, 5))
const status = async () => (await json(app.request('/api/status')))[1]

test('status: a node with no results is unknown with empty data; every node of the graph is there; demo is off', async () => {
  const s = await status()
  assert.deepEqual(s.nodes.a, { status: 'unknown', since: null, lastChecked: null, responseMs: null, history: [], checks: [] })
  assert.ok(['a', 'b'].every((id) => id in s.nodes))
  assert.equal(s.demo, false)
  assert.equal(s.lastEventId, db.lastEventId())
  assert.equal((await app.request('/api/status')).headers.get('Cache-Control'), 'no-store')
})

test('status: worst of the checks, history oldest first with 0 for failures, since from the trailing run, responseMs from the newest timed result', async () => {
  db.saveSnapshot('a', 'http', 'down', 'boom'); await nap()
  db.saveSnapshot('a', 'http', 'ok', undefined, 120); await nap()
  db.saveSnapshot('a', 'other', 'ok'); await nap() // no ms and ok: not in the history
  db.saveSnapshot('a', 'http', 'ok', undefined, 90)
  const rows = db.history('a', 500), s = (await status()).nodes.a
  assert.deepEqual([s.status, s.history, s.responseMs, s.since, s.lastChecked], ['ok', [0, 120, 90], 90, rows[1].at, rows[3].at])
  assert.deepEqual(s.checks.map((c: { id: string; ms: number | null }) => [c.id, c.ms]), [['http', 90], ['other', null]])
  db.saveSnapshot('a', 'other', 'degraded', 'slow'); await nap()
  const t = (await status()).nodes.a
  assert.deepEqual([t.status, t.since, t.history], ['degraded', db.history('a', 500)[4].at, [0, 120, 90, 0]])
  db.saveSnapshot('a', 'http', 'down', 'boom', 700)
  assert.deepEqual([(await status()).nodes.a.status, (await status()).nodes.a.responseMs], ['down', null])
})

test('status: only the last 48 history points are returned', async () => {
  for (let i = 1; i <= 60; i++) db.saveSnapshot('b', 'http', 'ok', undefined, i)
  const h = (await status()).nodes.b.history
  assert.deepEqual([h.length, h[0], h[47]], [48, 13, 60])
})
