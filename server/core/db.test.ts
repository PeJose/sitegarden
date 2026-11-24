import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from './db'

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-db-')), 'sitegarden.db')

test('events get growing ids and can be read after an id', () => {
  const db = openDb(tmp())
  const ids = ['a', 'b', 'c', 'd'].map((t) => db.append(t, { t }).id)
  assert.deepEqual(ids, [1, 2, 3, 4])
  assert.deepEqual(db.eventsAfter(2).map((e) => [e.id, e.type, e.data]), [[3, 'c', { t: 'c' }], [4, 'd', { t: 'd' }]])
  assert.equal(db.lastEventId(), 4)
  db.close()
})

test('cache keeps when it was fetched', () => {
  let t = 1000
  const db = openDb(tmp(), () => t)
  db.cacheSet('k', { v: 1 })
  t = 5000
  assert.deepEqual(db.cacheGet('k'), { value: { v: 1 }, fetched_at: 1000 })
  assert.equal(db.cacheGet('nope'), undefined)
  db.close()
})

test('plugin key-values are namespaced', () => {
  const db = openDb(tmp())
  db.kv('a').set('cursor', 1)
  db.kv('b').set('cursor', 2)
  assert.equal(db.kv('a').get('cursor'), 1)
  assert.equal(db.kv('b').get('cursor'), 2)
  db.kv('a').delete('cursor')
  assert.equal(db.kv('a').get('cursor'), undefined)
  assert.equal(db.kv('b').get('cursor'), 2)
  db.close()
})

test('data survives reopening the file, ids keep growing', () => {
  const f = tmp()
  const a = openDb(f)
  a.append('x', 1)
  a.saveSnapshot('n', 'http', 'ok')
  a.saveSnapshot('n', 'http', 'down', 'timeout')
  a.kv('p').set('k', 'v')
  a.close()
  const b = openDb(f)
  assert.equal(b.append('y', 2).id, 2)
  assert.deepEqual(b.snapshots().map((s) => [s.node, s.check_id, s.status, s.detail]), [['n', 'http', 'down', 'timeout']])
  assert.equal(b.kv('p').get('k'), 'v')
  b.close()
})
