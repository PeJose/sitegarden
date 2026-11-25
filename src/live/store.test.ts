import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setConfig } from '../mock/data'
import type { Config } from '../gen/types'
import { live, type Snapshot } from './store'
import { deploy } from './demo'

const node = (id: string, type: string) => ({ id, type, name: `${id} name`, checks: [] })
setConfig({ estates: [{ id: 'fernhill', label: 'fernhill', nodes: [node('fernhill-repo', 'repo'), node('fernhill-site', 'site'), node('fernhill-cms', 'cms')], edges: [{ from: 'fernhill-repo', to: 'fernhill-site', type: 'deploy' }] }] } as unknown as Config)
const entry = (status: string, o = {}) => ({ status, since: 1000, lastChecked: 2000, responseMs: 120, history: [100, 120], ...o })
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({ lastEventId: 10, demo: false, nodes: { 'fernhill-repo': entry('ok'), 'fernhill-site': entry('down', { responseMs: null }) } as Snapshot['nodes'], ...o })
const st = () => live.getState()
const stubFetch = (queued: number, calls: { url: string; body: string }[] = []) => mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => (calls.push({ url, body: String(init?.body) }), { ok: true, json: async () => ({ ok: true, queued }) }) as Response)

test('load: snapshot nodes, unknown for the rest, null times become 0', () => {
  live.load(snap({ nodes: { 'fernhill-repo': entry('ok', { lastChecked: null, since: null, history: [] }) } as Snapshot['nodes'] }))
  assert.equal(st().nodes['fernhill-repo'].lastChecked, 0)
  assert.deepEqual(st().nodes['fernhill-repo'].history, [])
  assert.equal(st().nodes['fernhill-site'].status, 'unknown') // not in the snapshot
  assert.equal(st().demo, false)
  assert.deepEqual(Object.keys(st().edges), ['fernhill-repo>fernhill-site'])
})

test('events: node.status, check.result, old ids ignored, unknown node ignored, history cap', () => {
  live.load(snap())
  live.apply('node.status', { node: 'fernhill-site', status: 'ok' }, 10) // id <= lastEventId: already in the snapshot
  assert.equal(st().nodes['fernhill-site'].status, 'down')
  const before = Date.now()
  live.apply('node.status', { node: 'fernhill-site', status: 'ok' }, 11)
  assert.equal(st().nodes['fernhill-site'].status, 'ok')
  assert.ok(st().nodes['fernhill-site'].since >= before)
  live.apply('check.result', { node: 'fernhill-repo', status: 'ok', ms: 150 }, 12)
  assert.deepEqual([st().nodes['fernhill-repo'].responseMs, st().nodes['fernhill-repo'].history], [150, [100, 120, 150]])
  live.apply('check.result', { node: 'fernhill-repo', status: 'ok' }, 13) // no time: no new point, last time kept
  assert.deepEqual([st().nodes['fernhill-repo'].responseMs, st().nodes['fernhill-repo'].history.length], [150, 3])
  live.apply('check.result', { node: 'fernhill-repo', status: 'down', ms: 99 }, 14)
  assert.deepEqual([st().nodes['fernhill-repo'].responseMs, st().nodes['fernhill-repo'].history.at(-1)], [null, 0])
  const was = st()
  live.apply('check.result', { node: 'elsewhere-site', status: 'ok', ms: 1 }, 15)
  assert.equal(st(), was)
  for (let i = 0; i < 60; i++) live.apply('check.result', { node: 'fernhill-repo', status: 'ok', ms: i + 1 }, 20 + i)
  assert.equal(st().nodes['fernhill-repo'].history.length, 48)
  assert.equal(st().nodes['fernhill-repo'].history.at(-1), 60)
})

test('refresh: POST /api/refresh, toast only when nothing is queued', async () => {
  const calls: { url: string; body: string }[] = [], said: string[] = []
  live.say = (m) => said.push(m)
  const f = stubFetch(1, calls)
  await live.check('fernhill-site')
  await live.checkAll()
  assert.deepEqual(calls, [{ url: '/api/refresh', body: '{"node":"fernhill-site"}' }, { url: '/api/refresh', body: '{}' }])
  assert.deepEqual(said, [])
  f.mock.restore()
  const z = stubFetch(0)
  await live.check('fernhill-site')
  await live.checkAll()
  assert.deepEqual(said, ['No checks on fernhill-site name', 'Nothing to check'])
  z.mock.restore()
  mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  await live.checkAll()
  assert.equal(said.at(-1), 'Could not reach the server')
  mock.restoreAll()
  live.say = undefined
})

test('demo deploy: both ends working during the flow, the server status after; down stays down; no deploy without demo', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  stubFetch(1)
  live.load(snap({ demo: false }))
  deploy('fernhill-repo>fernhill-site')
  assert.deepEqual(st().flows, {})
  live.load(snap({ demo: true }))
  deploy('fernhill-repo>fernhill-site')
  assert.equal(st().flows['fernhill-repo>fernhill-site'], 'deploy')
  assert.equal(st().nodes['fernhill-repo'].status, 'working')
  assert.equal(st().nodes['fernhill-site'].status, 'down') // down stays down
  live.apply('node.status', { node: 'fernhill-repo', status: 'degraded' }, 50) // the server keeps writing underneath
  assert.equal(st().nodes['fernhill-repo'].status, 'working')
  mock.timers.tick(12_000)
  assert.deepEqual(st().flows, {})
  assert.equal(st().nodes['fernhill-repo'].status, 'degraded')
  mock.restoreAll()
})
