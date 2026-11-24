import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from './db'
import { createScheduler, parseEvery } from './scheduler'
import type { CheckDef, CheckResult } from './sdk'

// Virtual time: timers fire in order as `advance` moves the clock, with a tick between them so awaited check runs settle.
function clock() {
  let t = 0, seq = 0
  const q: { at: number; seq: number; f: () => void }[] = []
  const tick = () => new Promise((r) => setImmediate(r))
  return {
    now: () => t,
    timers: { set(f: () => void, ms: number) { const e = { at: t + ms, seq: seq++, f }; q.push(e); return () => void q.splice(q.indexOf(e) >>> 0, +(q.includes(e))) } },
    async advance(ms: number) {
      const end = t + ms
      for (;;) {
        const e = q.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
        if (!e) break
        q.splice(q.indexOf(e), 1); t = e.at; e.f(); await tick()
      }
      t = end; await tick()
    },
  }
}
const setup = (random = () => 0.5, limit?: number, redact?: (s: string) => string) => {
  const c = clock(), events: { type: string; data: any }[] = []
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-sch-')), 'sg.db'), c.now)
  const s = createScheduler({ db, emit: (type, data) => events.push({ type, data }), limit, redact, random, timers: c.timers })
  return { c, events, db, s }
}
const node = (id: string) => ({ id, type: 'site' })
const MIN = 60_000

test('intervals parse', () => {
  assert.deepEqual(['30s', '5m', '1h', '1d'].map(parseEvery), [30_000, 300_000, 3_600_000, 86_400_000])
  assert.throws(() => parseEvery('5 minutes'))
})

test('a check detail with a secret value is stored and emitted as [secret:NAME]', async () => {
  const { c, s, db, events } = setup(undefined, undefined, (t) => t.replaceAll('tok-abcdef', '[secret:T]'))
  s.set([node('n')], [{ id: 'c', every: '1m', run: () => ({ status: 'down', detail: 'HTTP 401 for tok-abcdef' }) }, { id: 'd', every: '1m', run: () => { throw new Error('tok-abcdef') } }])
  await c.advance(MIN)
  assert.deepEqual(db.snapshots().map((x) => x.detail), ['HTTP 401 for [secret:T]', '[secret:T]'])
  assert.ok(events.filter((e) => e.type === 'check.result').every((e) => !JSON.stringify(e).includes('tok-abcdef')))
  s.stop()
})

test('first runs spread over the first interval, later ones within 10 % of it', async () => {
  let n = 0
  const { c, s } = setup(() => (n++ % 20) / 20)
  const at: number[] = [], who: string[] = []
  s.set(Array.from({ length: 20 }, (_, i) => node(`n${i}`)), [{ id: 'c', every: '5m', run: (n) => { at.push(c.now()); who.push(n.id); return { status: 'ok' } } }])
  await c.advance(5 * MIN)
  const first = who.map((w, i) => (who.indexOf(w) === i ? at[i] : -1)).filter((x) => x >= 0)
  assert.equal(first.length, 20)
  assert.ok(new Set(first).size > 10, 'not all in the same second')
  assert.ok(first.every((x) => x < 5 * MIN))
  const gap = at[who.indexOf(who[0], 1)] - at[0]
  assert.ok(gap >= 4.5 * MIN && gap <= 5.5 * MIN, `second run after ${gap}`)
})

test('no more than the limit run at once', async () => {
  const { c, s } = setup(() => 0, 4)
  let now = 0, peak = 0
  const gates: (() => void)[] = []
  s.set(Array.from({ length: 10 }, (_, i) => node(`n${i}`)), [{ id: 'c', every: '5m', run: async () => { peak = Math.max(peak, ++now); await new Promise<void>((r) => gates.push(r)); now--; return { status: 'ok' } } }])
  await c.advance(1)
  assert.equal(gates.length, 4)
  while (gates.length) { gates.shift()!(); await c.advance(0) }
  assert.equal(peak, 4)
})

test('a failing check backs off up to 4x and one success resets it', async () => {
  const { c, s } = setup(() => 0.5) // jitter 0
  const at: number[] = []
  let res: CheckResult = { status: 'down' }
  s.set([node('a')], [{ id: 'c', every: '5m', run: () => { at.push(c.now()); return res } }])
  await c.advance(2.5 * MIN)
  assert.deepEqual(at, [2.5 * MIN])
  await c.advance(60 * MIN)
  assert.deepEqual(at.slice(1).map((x, i) => (x - at[i]) / MIN), [10, 20, 20, 20].slice(0, at.length - 1))
  res = { status: 'ok' }
  await c.advance(20 * MIN)
  at.length = 0
  await c.advance(30 * MIN)
  assert.deepEqual(at.slice(1).map((x, i) => (x - at[i]) / MIN), [5, 5, 5, 5, 5])
})

test('a result is stored and a status change emits node.status', async () => {
  const { c, s, db, events } = setup(() => 0)
  let res: CheckResult = { status: 'ok' }
  s.set([node('a')], [{ id: 'c', every: '5m', run: () => res }])
  await c.advance(1)
  res = { status: 'down', detail: 'timeout' }
  await c.advance(6 * MIN)
  assert.deepEqual(events.map((e) => e.type), ['check.result', 'node.status', 'check.result', 'node.status'])
  assert.deepEqual(events[3].data, { node: 'a', status: 'down', from: 'ok' })
  assert.deepEqual(db.snapshots().map((x) => [x.node, x.check_id, x.status, x.detail]), [['a', 'c', 'down', 'timeout']])
})

test('a node shows the worst status of its checks; a throwing check is down', async () => {
  const { c, s, events } = setup(() => 0)
  const checks: CheckDef[] = [{ id: 'x', every: '5m', run: () => ({ status: 'ok' }) }, { id: 'y', every: '5m', run: () => { throw new Error('boom') } }]
  s.set([node('a')], checks)
  await c.advance(1)
  assert.equal(events.filter((e) => e.type === 'node.status').at(-1)!.data.status, 'down')
  assert.equal(events.find((e) => e.data.detail === 'boom')!.data.status, 'down')
})

test('refresh runs the matching checks now despite backoff', async () => {
  const { c, s } = setup(() => 0)
  const ran: string[] = []
  s.set([node('a'), node('b')], [{ id: 'c', every: '5m', run: (n) => { ran.push(n.id); return { status: 'down' } } }])
  await c.advance(1)
  ran.length = 0
  assert.equal(s.refresh('a'), 1)
  await c.advance(1)
  assert.deepEqual(ran, ['a'])
  assert.equal(s.refresh(), 2)
  await c.advance(1)
  assert.deepEqual(ran.slice(1).sort(), ['a', 'b'])
})

test('nodeTypes limits which nodes a check runs for', async () => {
  const { c, s } = setup(() => 0)
  const ran: string[] = []
  s.set([node('a'), { id: 'r', type: 'repo' }], [{ id: 'c', every: '5m', nodeTypes: ['repo'], run: (n) => { ran.push(n.id); return { status: 'ok' } } }])
  await c.advance(1)
  assert.deepEqual(ran, ['r'])
})
