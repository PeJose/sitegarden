import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-lr-')), local = path.join(dir, 'local'), file = path.join(local, 'sitegarden.yaml')
process.env.SITEGARDEN_DATA = path.join(dir, 'data') // before store.ts and config.ts load
process.env.SITEGARDEN_CONFIG = path.join(dir, 'server.yaml')
const root = path.join(import.meta.dirname, '..')
const base = `world: { seed: t }
plugins: ['${root}/plugins/essentials']
groups:
  - { id: g1, label: g1 }
nodes:
  - { id: a, type: repo, group: g1 }
edges: []
`
fs.mkdirSync(local)
fs.writeFileSync(process.env.SITEGARDEN_CONFIG, base)
fs.writeFileSync(file, base)
const { start } = await import('./app')
const { db } = await import('./config')
const { currentRelease, has } = await import('./store')
const srv = await start(0)
after(() => srv.close())

const sg = (port: number, ...args: string[]) => new Promise<{ code: number; out: string }>((resolve) => {
  execFile(process.execPath, ['--import', 'tsx', path.join(root, 'server/sg.ts'), ...args], { cwd: root, env: { ...process.env, SITEGARDEN_CONFIG: file, SITEGARDEN_SERVER: `http://localhost:${port}` } }, (e, stdout, stderr) => resolve({ code: e ? Number(e.code) : 0, out: stdout + stderr }))
})
const progress = () => db.eventsAfter(0).filter((e) => e.type === 'apply.progress').length

test('--local-render uploads the missing tiles and the server renders none itself', { timeout: 300_000 }, async () => {
  while (!currentRelease()?.complete) await new Promise((r) => setTimeout(r, 200)) // the server renders rev 1 itself at start
  const before = progress()
  assert.equal((await sg(srv.port, 'pull', '--force')).code, 0)
  fs.writeFileSync(file, base.replace('edges: []', '  - { id: b, type: site, group: g1 }\nedges: []'))
  const r = await sg(srv.port, 'apply', '--yes', '--local-render')
  assert.equal(r.code, 0, r.out)
  const [, n, total] = /rendering (\d+) of (\d+) tiles here/.exec(r.out)!
  assert.ok(Number(n) > 0 && Number(n) < Number(total), `only the changed estate's tiles: ${n} of ${total}`)
  assert.match(r.out, new RegExp(`uploaded ${n} tiles`))
  assert.equal(progress(), before, 'the server rendered a tile')
  const cur = currentRelease()!
  assert.ok(cur.complete)
  assert.ok(Object.values(cur.tiles.names).flat(2).every((t) => t && has(t)))
  assert.equal(db.getRev(db.latestRev())!.source, 'cli')
})

test('a renderer mismatch stops before anything is uploaded', async () => {
  const seen: string[] = []
  const fake = http.createServer((req, res) => { seen.push(`${req.method} ${req.url}`); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ rev: 1, yaml: '', renderer: 'r0', positions: {} })) })
  await new Promise<void>((ok) => fake.listen(0, ok))
  const r = await sg((fake.address() as { port: number }).port, 'apply', '--yes', '--local-render')
  fake.close()
  assert.equal(r.code, 1)
  assert.match(r.out, /renderer mismatch: server has r0, this machine r\d+/)
  assert.deepEqual(seen, ['GET /api/state'])
})
