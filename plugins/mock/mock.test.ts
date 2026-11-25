import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from '../../server/core/db'
import { createHost, withDemo } from '../../server/core/plugins'
import type { CheckTypeDef } from '../../server/core/sdk'
import plugin, { env } from './server'

const baseDir = path.join(import.meta.dirname, '../..')
const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mock-')), 'sg.db'))
// A fresh registration per test (its own run counts), driven by a fixed clock and a scripted random. The module is imported directly: the host's dynamic import may be another instance, with its own `env`.
function setup(rolls: number[] = []) {
  const t = { now: 1_000_000 }
  let def!: CheckTypeDef
  void plugin.register({ registerCheckType: (d: CheckTypeDef) => (def = d), store: { kv: db.kv('mock-test-' + Math.random()) } } as never)
  env.now = () => t.now
  env.random = () => rolls.shift() ?? 0.5
  return { t, run: (mock: object, id = 'n') => def.run({}, { id, type: 'site', mock }, undefined as never) as { status: string; ms?: number } }
}

test('the first run returns initialStatus, so the sample opens with its designed scene', async () => {
  const { run } = setup()
  assert.equal(run({ initialStatus: 'down', baseMs: 200 }).status, 'down')
  assert.deepEqual(run({ initialStatus: 'degraded', baseMs: 200 }, 'm'), { status: 'degraded', ms: 220 })
})

test('a node that starts down recovers after its first 3 runs', async () => {
  const { run } = setup()
  const m = { initialStatus: 'down', baseMs: 200 }
  assert.deepEqual([1, 2, 3, 4].map(() => run(m).status), ['down', 'down', 'down', 'ok'])
})

test('baseMs 0 is ok with no ms, always', async () => {
  const { run } = setup()
  assert.deepEqual([run({ baseMs: 0 }), run({ baseMs: 0 }), run({ baseMs: 0 })], [{ status: 'ok' }, { status: 'ok' }, { status: 'ok' }])
})

test('ms is baseMs * U(0.7, 1.5); 6 % degraded; 2 % down for ~25 s, then ok again', async () => {
  const { run, t } = setup([0.5, 0.0, 0.05, 0.01])
  const m = { baseMs: 100, initialStatus: 'ok' }
  run(m) // first run (consumes the 0.5 for ms)
  assert.deepEqual(run(m), { status: 'down' }) // roll 0.0: 2 % branch (no ms roll)
  t.now += 24_000
  assert.deepEqual(run(m), { status: 'down' }) // still inside the 25 s window, no roll used
  t.now += 2_000
  assert.deepEqual(run(m), { status: 'degraded', ms: 71 }) // roll 0.05 -> degraded; ms roll 0.01 -> 100 * 0.708
})

test('an ordinary run is ok with ms in range', async () => {
  const { run } = setup([0.5, 0.5, 0.5])
  const m = { baseMs: 100 }
  run(m)
  const r = run(m)
  assert.equal(r.status, 'ok')
  assert.equal(r.ms, 110) // 100 * (0.7 + 0.5 * 0.8)
})

test('SITEGARDEN_DEMO loads mock once, whatever the list spells', async () => {
  const mock = path.join(baseDir, 'plugins/mock')
  assert.deepEqual(withDemo(['./plugins/essentials'], baseDir, false), ['./plugins/essentials'])
  assert.deepEqual(withDemo(['./plugins/essentials'], baseDir, true), ['./plugins/essentials', mock])
  assert.deepEqual(withDemo(['./plugins/mock'], baseDir, true), ['./plugins/mock'])
  assert.deepEqual(withDemo([mock + '/'], baseDir, true), [mock + '/'])
  const h = createHost({ baseDir, db })
  await h.load(withDemo(['./plugins/essentials'], baseDir, true))
  assert.deepEqual(h.plugins().map((p) => [p.id, p.status]), [['essentials', 'loaded'], ['mock', 'loaded']])
})
