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
fs.writeFileSync(process.env.SITEGARDEN_CONFIG, base)
const { app } = await import('./app')
const { bootstrap, db } = await import('./config')
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
  assert.deepEqual((await json(post('/api/artifacts/missing', { names: ['tile-abc.webp', 'tile-zzz.webp'] })))[1], { missing: ['tile-zzz.webp'] })
  assert.equal((await json(post('/api/artifacts/missing', { names: ['../x'] })))[0], 400)
})

test('with auth enabled, apply and GUI edits are refused and no rev is made', async () => {
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
