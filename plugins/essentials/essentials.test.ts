import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { openDb } from '../../server/core/db'
import { ConfigError, parseGraph } from '../../server/core/graph'
import { createHttp } from '../../server/core/http'
import { createHost } from '../../server/core/plugins'
import { createSecrets } from '../../server/core/secrets'

const baseDir = path.join(import.meta.dirname, '../..')
const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ess-')), 'sg.db'))
const host = createHost({ baseDir, db })
await host.load(['./plugins/essentials'])
const parse = (nodes: string) => parseGraph(`world: { seed: s }\ngroups:\n  - { id: g, label: G }\nnodes:\n${nodes}`, 'x.yaml', host.nodeTypes(), host.shorthands(), host.checkTypes())
const labels = (nodes: string) => parse(nodes).nodes[0].links!.map((l) => l.label)

test('repo, sanity with studio, and url give their links', () => {
  assert.deepEqual(labels('  - { id: a, type: repo, group: g, repo: acme/fern.hill_2 }'), ['Actions', 'Settings', 'Secrets', 'Pull requests', 'Issues'])
  const cms = parse('  - { id: a, type: cms, group: g, sanity: ab12cd, studio: fern-hill }').nodes[0].links!
  assert.deepEqual(cms.map((l) => [l.label, l.url]), [
    ['Sanity manage', 'https://www.sanity.io/manage/project/ab12cd'], ['API', 'https://www.sanity.io/manage/project/ab12cd/api'],
    ['Webhooks', 'https://www.sanity.io/manage/project/ab12cd/api#webhooks'], ['Studio', 'https://fern-hill.sanity.studio'],
  ])
  assert.deepEqual(parse('  - { id: a, type: site, group: g, url: "https://fern.example/x" }').nodes[0].links, [{ label: 'fern.example', url: 'https://fern.example/x' }])
})

test('bad values are errors on their line', () => {
  for (const [type, field, bad] of [['repo', 'repo', 'fernhill'], ['repo', 'repo', 'a/b/c'], ['cms', 'sanity', 'Not Valid'], ['cms', 'studio', 'a.b'], ['site', 'url', 'ftp://x.example'], ['site', 'url', 'x.example']]) {
    try { parse(`  - { id: ok, type: db, group: g }\n  - { id: a, type: ${type}, group: g, ${field}: "${bad}" }`); assert.fail(`${field}: ${bad} parsed`) } catch (e) {
      assert.ok(e instanceof ConfigError, String(e))
      assert.deepEqual([e.issues[0].line, e.issues[0].path], [6, `nodes.1.${field}`])
    }
  }
  assert.throws(() => parse('  - { id: a, type: repo, group: g, repo: fernhill }'), /must be owner\/name/)
})

// A local server: /ok answers 200 with "Hello Fernhill", /down 503, /slow never, /flip 503 while `flipDown` is set.
let flipDown = true
const server = http.createServer((req, res) => {
  if (req.url === '/slow') return
  const [code, body] = req.url === '/down' || (req.url === '/flip' && flipDown) ? [503, 'maintenance'] : [200, 'Hello Fernhill']
  res.writeHead(code).end(body)
}).listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
// One run of the first `checks:` entry of a site node written as YAML.
const runner = (h: typeof host, entry: string, extra = '') => {
  const g = parseGraph(`world: { seed: s }\ngroups:\n  - { id: g, label: G }\nnodes:\n  - { id: s, type: site, group: g, ${extra} checks: [${entry}] }\n`, 'x.yaml', h.nodeTypes(), h.shorthands(), h.checkTypes())
  return () => h.configured(g.nodes)[0].check.run(g.nodes[0])
}
const priv = 'allow_private: true'

test('http check: ok, wrong status, missing text, status list, node url default, timeout', async () => {
  const ok = await runner(host, `{ type: http, url: "${base}/ok", expect_text: Fernhill, ${priv} }`)()
  assert.equal(ok.status, 'ok'); assert.match(ok.detail!, /^200 in \d+ ms$/)
  const wrong = await runner(host, `{ type: http, url: "${base}/down", ${priv} }`)()
  assert.equal(wrong.status, 'down'); assert.match(wrong.detail!, /^expected 2xx, got 503 \(\d+ ms\)$/)
  assert.match((await runner(host, `{ type: http, url: "${base}/ok", expect_status: 201, ${priv} }`)()).detail!, /^expected 201, got 200/)
  assert.equal((await runner(host, `{ type: http, url: "${base}/down", expect_status: [200, 503], ${priv} }`)()).status, 'ok')
  const text = await runner(host, `{ type: http, url: "${base}/ok", expect_text: Gone, ${priv} }`)()
  assert.equal(text.status, 'down'); assert.match(text.detail!, /^text "Gone" not found \(200, \d+ ms\)$/)
  assert.equal((await runner(host, `{ type: http, ${priv} }`, `url: "${base}/ok",`)()).status, 'ok')
  const none = await runner(host, '{ type: http }')()
  assert.deepEqual([none.status, none.detail], ['down', 'no url on the check or the node'])
  const slow = await runner(host, `{ type: http, url: "${base}/slow", timeout: 1s, ${priv} }`)()
  assert.deepEqual([slow.status, slow.detail], ['down', 'request timed out after 1000 ms'])
})

test('alert_after 2: degraded, then down, then ok, and one success resets the count', async () => {
  db.kv('essentials').delete('fails:s#0')
  const run = runner(host, `{ type: http, url: "${base}/flip", alert_after: 2, ${priv} }`)
  const seq: string[] = []
  for (const down of [true, true, false, true]) { flipDown = down; seq.push((await run()).status) }
  assert.deepEqual(seq, ['degraded', 'down', 'ok', 'degraded'])
})

test('the fail count is kept by the plugin store, so a new host on the same db continues it', async () => {
  const mk = async () => { const h = createHost({ baseDir, db }); await h.load(['./plugins/essentials']); return h }
  flipDown = true
  const entry = `{ type: http, url: "${base}/flip", alert_after: 2, ${priv} }`
  db.kv('essentials').delete('fails:s#0')
  assert.equal((await runner(await mk(), entry)()).status, 'degraded')
  assert.equal((await runner(await mk(), entry)()).status, 'down')
})

test('private and loopback targets need allow_private; the blocked reason names the address and no connection is made', async () => {
  const seen: string[] = []
  const guarded = createHost({ baseDir, db, http: createHttp({ secrets: createSecrets(), lookup: ((h: string, _o: unknown, cb: (...a: unknown[]) => void) => { seen.push(h); cb(null, [{ address: '10.0.0.5', family: 4 }]) }) as never }) })
  await guarded.load(['./plugins/essentials'])
  assert.equal((await runner(guarded, '{ type: http, url: "http://192.168.1.1/" }')()).detail, 'blocked address 192.168.1.1')
  assert.equal((await runner(guarded, `{ type: http, url: "${base}/ok" }`)()).detail, 'blocked address 127.0.0.1')
  assert.equal((await runner(guarded, '{ type: http, url: "http://router.example/" }')()).detail, 'blocked address 10.0.0.5')
  assert.deepEqual(seen, ['router.example'])
})

after(() => { server.closeAllConnections(); server.close() })
