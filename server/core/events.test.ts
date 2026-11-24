import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'
import { openDb } from './db'
import { createBus, eventsHandler } from './events'

const setup = () => {
  const bus = createBus(openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ev-')), 'sg.db')))
  const app = new Hono().get('/api/events', eventsHandler(bus, () => null, 40))
  return { bus, app }
}
// Reads SSE frames until `n` events (frames with an id) have arrived.
async function read(res: Response, n: number) {
  const out: { id: string; event: string; data: string }[] = [], dec = new TextDecoder(), reader = res.body!.getReader()
  let buf = ''
  while (out.length < n) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value)
    const frames = buf.split('\n\n')
    buf = frames.pop()!
    for (const f of frames) {
      const m = Object.fromEntries(f.split('\n').filter((l) => /^\w+: /.test(l)).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(': ') + 2)]))
      if (m.id) out.push(m as (typeof out)[number])
    }
  }
  await reader.cancel()
  return out
}

test('a secret value in an event is stored as [secret:NAME], at any depth', () => {
  const bus = createBus(openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ev-')), 'sg.db')), (s) => s.replaceAll('tok-abcdef', '[secret:T]'))
  const e = bus.emit('x', { a: 'got tok-abcdef', b: [{ c: 'tok-abcdef' }], n: 1 })
  assert.deepEqual(e.data, { a: 'got [secret:T]', b: [{ c: '[secret:T]' }], n: 1 })
  assert.deepEqual(bus.db.eventsAfter(0)[0].data, e.data)
})

test('reconnect with Last-Event-ID gets the missed events, then live ones, with no gap or duplicate', async () => {
  const { bus, app } = setup()
  for (let i = 1; i <= 5; i++) bus.emit('check.result', { i })
  const res = await app.request('/api/events', { headers: { 'Last-Event-ID': '2' } })
  setTimeout(() => { bus.emit('node.status', { n: 6 }); bus.emit('release', 'r:1') }, 20)
  const got = await read(res, 5)
  assert.deepEqual(got.map((e) => e.id), ['3', '4', '5', '6', '7'])
  assert.deepEqual(got.map((e) => e.event), ['check.result', 'check.result', 'check.result', 'node.status', 'release'])
  assert.deepEqual(JSON.parse(got[3].data), { n: 6 })
})

test('an idle stream sends keep-alives', async () => {
  const { app } = setup()
  const res = await app.request('/api/events')
  const r = res.body!.getReader()
  let text = ''
  while (!text.includes(': keep-alive')) text += new TextDecoder().decode((await r.read()).value)
  await r.cancel()
})
