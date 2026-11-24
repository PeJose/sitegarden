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
