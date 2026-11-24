import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cli-')), local = path.join(dir, 'local')
process.env.SITEGARDEN_DATA = path.join(dir, 'data') // before store.ts and config.ts load
process.env.SITEGARDEN_CONFIG = path.join(dir, 'server.yaml')
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
const file = path.join(local, 'sitegarden.yaml')
fs.mkdirSync(local)
fs.writeFileSync(process.env.SITEGARDEN_CONFIG, base)
fs.writeFileSync(file, base)
const { app, engine, start } = await import('./app')
const { db, loadConfig, loadPositions } = await import('./config')
const { computePlan } = await import('./plan')
const { publish } = await import('./store')
// No rendering here: the stub publishes a complete release for the stored config.
let boom = false
engine.apply = async (_log, _stale, progress) => {
  if (boom) throw new Error('boom')
  const plan = computePlan(await loadConfig(), loadPositions())
  progress?.(1, 1)
  publish({ id: plan.id, rev: 1, complete: true } as Parameters<typeof publish>[0])
  return { rendered: {}, tiles: 0, ms: 0, first: 0, aborted: false }
}
const srv = await start(0)
after(() => srv.close())

const sg = (...args: string[]) => new Promise<{ code: number; out: string }>((resolve) => {
  const p = execFile(process.execPath, ['--import', 'tsx', path.join(root, 'server/sg.ts'), ...args], { cwd: root, env: { ...process.env, SITEGARDEN_CONFIG: file, SITEGARDEN_SERVER: `http://localhost:${srv.port}` } }, (e, stdout, stderr) => resolve({ code: e ? Number(e.code) : 0, out: stdout + stderr }))
  p.stdin!.end('n\n')
})
const withNode = (id: string) => base.replace('edges:', `  - { id: ${id}, type: repo, group: g1 }\nedges:`)

test('the first plan refuses until the file is pulled, then plan shows the diff and changes nothing', async () => {
  const r = await sg('plan')
  assert.deepEqual([r.code, r.out.trim().split('\n').at(-1)], [3, 'server is at rev 1, you are based on rev 0: run sg pull'])
  assert.equal((await sg('pull')).code, 0)
  fs.writeFileSync(file, withNode('c'))
  const p = await sg('plan')
  assert.equal(p.code, 0)
  assert.match(p.out, /server http:\/\/localhost:\d+ at rev 1\n\+ node c\nto render: /)
  assert.equal(db.latestRev(), 1)
})

test('an invalid local file prints the error with its line and exits 1', async () => {
  fs.writeFileSync(file, base.replace('to: b', 'to: nope'))
  const r = await sg('plan')
  assert.deepEqual([r.code, r.out.trim()], [1, 'sitegarden.yaml:9 edges.0.to: edge to "nope": no node with that id'])
})

test('apply asks first, then stores the next rev and waits for the release', async () => {
  fs.writeFileSync(file, withNode('c'))
  const no = await sg('apply')
  assert.deepEqual([no.code, db.latestRev()], [1, 1])
  const r = await sg('apply', '--yes')
  assert.equal(r.code, 0)
  assert.match(r.out, /applied as rev 2\n(\[apply\] 1\/1 tiles\n)?release published/)
  assert.equal(db.latestRev(), 2)
  assert.match((await sg('apply', '--yes')).out, /no changes, server stays at rev 2/)
})

test('a GUI edit makes plan and apply refuse until sg pull, which refuses over unapplied edits', async () => {
  const gui = await app.request('/api/estates', { method: 'POST', body: JSON.stringify({ id: 'zeta', label: 'zeta', nodes: [{ id: 'zeta-repo', type: 'repo' }], edges: [] }) })
  assert.equal(gui.status, 200)
  for (const cmd of ['plan', 'apply']) assert.deepEqual(await sg(cmd, '--yes').then((r) => [r.code, r.out.trim().split('\n').at(-1)]), [3, 'server is at rev 3, you are based on rev 2: run sg pull'])
  assert.equal(db.latestRev(), 3)
  fs.appendFileSync(file, '# mine\n')
  const refused = await sg('pull')
  assert.equal(refused.code, 1)
  assert.match(refused.out, /never applied/)
  assert.equal((await sg('pull', '--force')).code, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), db.getRev(3)!.yaml)
  assert.match((await sg('plan')).out, /no changes/)
})

test('a comment-only apply stores a new rev, and sg pull then needs no --force', async () => {
  fs.appendFileSync(file, '# note\n')
  const r = await sg('apply', '--yes')
  assert.deepEqual([r.code, db.latestRev()], [0, 4])
  assert.match(r.out, /no graph changes, text changed: stored as rev 4/)
  assert.equal((await sg('pull')).code, 0)
})

test('when the server render fails, apply prints the message and exits 1 instead of waiting', async () => {
  boom = true
  fs.writeFileSync(file, withNode('d'))
  const r = await sg('apply', '--yes')
  boom = false
  assert.equal(r.code, 1)
  assert.match(r.out, /apply failed on the server: boom/)
  assert.deepEqual(db.eventsAfter(0).filter((e) => e.type === 'apply.failed').map((e) => e.data), [{ rev: 5, message: 'boom' }])
})

test('sg plan prints a warning for a declared secret that has no value', async () => {
  fs.writeFileSync(file, db.getRev(db.latestRev())!.yaml.replace('groups:', 'secrets:\n  SG_TEST_UNSET: {}\ngroups:'))
  assert.match((await sg('plan')).out, /warning: secret SG_TEST_UNSET is not set\n/)
})
