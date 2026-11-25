import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { DriftError, openDb } from './db'

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

test('revisions grow, a stale base is rejected and only one of two racing stores wins', () => {
  const f = tmp(), a = openDb(f), b = openDb(f)
  assert.equal(a.latestRev(), 0)
  assert.equal(a.storeRev(0, 'one', 'bootstrap'), 1)
  assert.equal(a.storeRev(1, 'two', 'cli'), 2)
  assert.deepEqual([a.getRev(2)?.yaml, a.getRev(2)?.source, a.getRev(9)], ['two', 'cli', undefined])
  assert.throws(() => a.storeRev(1, 'late', 'cli'), (e) => e instanceof DriftError && e.latest === 2)
  const results = [a, b].map((d) => { try { return d.storeRev(2, 'x', 'gui') } catch (e) { return e } })
  assert.equal(results.filter((r) => r === 3).length, 1)
  assert.ok(results.some((r) => r instanceof DriftError))
  assert.equal(b.latestRev(), 3)
  a.close(); b.close()
})

test('ms is stored with the snapshot and its history; a file from before the column gets it on open', () => {
  const f = tmp(), old = new DatabaseSync(f)
  openDb(f).close()
  for (const t of ['snapshots', 'snapshot_history']) old.exec(`ALTER TABLE ${t} DROP COLUMN ms`)
  old.exec(`INSERT INTO snapshots(node, check_id, status, at) VALUES('n', 'old', 'ok', 1)`)
  old.close()
  const db = openDb(f)
  assert.equal(db.snapshots()[0].ms, null)
  db.saveSnapshot('n', 'http', 'ok', undefined, 120)
  db.saveSnapshot('n', 'old', 'down')
  assert.deepEqual(db.snapshots().map((s) => [s.check_id, s.ms]), [['http', 120], ['old', null]])
  db.close()
  openDb(f).close() // a second open does not add the column again
})

test('prune moves old events and check history to the archive (check.result dropped), keeps the latest snapshot', () => {
  let t = 1000
  const f = tmp(), db = openDb(f, () => t)
  db.append('old', {}); db.append('check.result', {}); db.saveSnapshot('a', 'c', 'down', undefined, 5)
  t = 9000
  db.append('new', {}); db.saveSnapshot('a', 'c', 'ok', undefined, 7)
  assert.equal(db.prune(5000), 3)
  assert.deepEqual([db.eventsAfter(0).map((e) => e.type), db.history('a', 10).map((r) => r.ms), db.snapshots().map((s) => s.status)], [['new'], [7], ['ok']])
  db.close()
  const raw = new DatabaseSync(f) // the per-node history read uses its index instead of a scan
  assert.deepEqual(raw.prepare('SELECT type FROM archive_events').all().map((r: any) => r.type), ['old'])
  assert.deepEqual(raw.prepare('SELECT status, ms FROM archive_history').all().map((r: any) => [r.status, r.ms]), [['down', 5]])
  const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT check_id, status, at, ms FROM snapshot_history WHERE node = ? ORDER BY rowid DESC LIMIT ?').all('a', 10) as { detail: string }[]
  assert.match(plan.map((p) => p.detail).join(' '), /snapshot_history_node/)
  raw.close()
})

test('sessions: found until they expire, extended, removed; prune drops the expired ones; a v4 file gets the table', () => {
  let t = 1000
  const f = tmp(), old = new DatabaseSync(f)
  openDb(f).close()
  old.exec('DROP TABLE sessions; PRAGMA user_version=4')
  old.close()
  const db = openDb(f, () => t)
  db.addSession('h1', 'owner', 5000); db.addSession('h2', 'owner', 9000)
  assert.deepEqual([db.session('h1', 4999)?.user, db.session('h1', 5000), db.session('nope', 0)], ['owner', undefined, undefined])
  db.extendSession('h1', 20_000)
  assert.equal(db.session('h1', 15_000)?.expires, 20_000)
  t = 10_000; db.prune(0)
  assert.deepEqual([db.session('h2', 0), db.session('h1', 0)?.user], [undefined, 'owner'])
  db.removeSession('h1')
  assert.equal(db.session('h1', 0), undefined)
  db.close()
})

test('api tokens: found by hash only, never listed with it, touched, revoked; a v5 file gets the table', () => {
  const f = tmp(), old = new DatabaseSync(f)
  openDb(f).close()
  old.exec('DROP TABLE api_tokens; PRAGMA user_version=5')
  old.close()
  const db = openDb(f, () => 1000)
  const id = db.addToken('ci', 'h1', 1000)
  assert.deepEqual(db.tokens().map((t) => ({ ...t })), [{ id, name: 'ci', created: 1000, last_used: null }])
  assert.deepEqual([db.tokenByHash('h1')?.name, db.tokenByHash('nope')], ['ci', undefined])
  assert.throws(() => db.addToken('dup', 'h1', 1)) // a hash is unique
  db.touchToken(id, 5000)
  assert.equal(db.tokens()[0].last_used, 5000)
  assert.deepEqual([db.removeToken(id), db.removeToken(id), db.tokenByHash('h1')], [true, false, undefined])
  db.close()
})
