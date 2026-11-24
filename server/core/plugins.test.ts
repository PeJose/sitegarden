import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import { openDb } from './db'
import { createHttp } from './http'
import { createSecrets } from './secrets'
import { createBus } from './events'
import { createHost, satisfies } from './plugins'

const baseDir = path.join(import.meta.dirname, 'fixtures')
const status = (h: ReturnType<typeof createHost>) => Object.fromEntries(h.plugins().map((p) => [p.id, p.status === 'loaded' ? 'loaded' : p.error]))

test('version ranges: caret, tilde, exact, and nothing else', () => {
  assert.ok(satisfies('1.4.0', '^1') && satisfies('1.0.0', '^1.0.0') && !satisfies('2.0.0', '^1') && !satisfies('0.3.1', '^0.2.0') && satisfies('0.2.9', '^0.2.0'))
  assert.ok(satisfies('1.2.9', '~1.2.0') && !satisfies('1.3.0', '~1.2.0') && satisfies('1.2.3', '1.2.3') && !satisfies('1.2.4', '1.2.3'))
  assert.throws(() => satisfies('1.0.0', '>=1'), /unsupported/)
})

test('plugins load in dependsOn order, whatever the list order; registrations are merged', async () => {
  const h = createHost({ baseDir })
  await h.load(['./needs-base', './base'])
  assert.deepEqual(h.plugins().map((p) => p.id), ['base', 'needs-base'])
  assert.deepEqual(Object.keys(h.nodeTypes()), ['widget', 'gadget'])
  assert.deepEqual(h.checks().map((c) => c.id), ['base.ping'])
})

test('a plugin for a newer apiVersion is refused with both versions, others load', async () => {
  const h = createHost({ baseDir })
  await h.load(['./newer-api', './base'])
  assert.match(status(h)['newer-api']!, /\^2.*1\.1\.0/)
  assert.equal(status(h).base, 'loaded')
})

test('a missing dependency refuses the plugin and names it; a dependent of a refused plugin is refused too', async () => {
  const h = createHost({ baseDir })
  await h.load(['./needs-missing', './base'])
  assert.match(status(h)['needs-missing']!, /"absent"/)
  assert.equal(status(h).base, 'loaded')
  await h.load(['./needs-base'])
  assert.match(status(h)['needs-base']!, /"base"/)
})

test('a throwing register is isolated and leaves nothing behind', async () => {
  const h = createHost({ baseDir })
  await h.load(['./throws', './base'])
  assert.equal(status(h).throws, 'boom')
  assert.equal(status(h).base, 'loaded')
  assert.deepEqual(Object.keys(h.nodeTypes()), ['widget'])
})

test('a theme-only plugin is listed from its manifest and never imported', async () => {
  const imported: string[] = []
  const h = createHost({ baseDir, importModule: async (f) => { imported.push(f); throw new Error('should not import') } })
  await h.load(['./theme-only'])
  assert.deepEqual(h.plugins().map((p) => [p.id, p.status, p.manifest?.contributes.themes]), [['theme-only', 'loaded', ['./tokens.json']]])
  assert.deepEqual(imported, [])
})

test('unloading removes every registration', async () => {
  const h = createHost({ baseDir })
  await h.load(['./base', './needs-base'])
  await h.unloadAll()
  assert.deepEqual([h.plugins(), h.nodeTypes(), h.checks()], [[], {}, []])
})

test('a registration disposer removes just that registration', async () => {
  const h = createHost({ baseDir, importModule: async () => ({ default: { id: 'base', register: (ctx) => { ctx.registerNodeType('a'); ctx.registerNodeType('b')(); } } }) })
  await h.load(['./base'])
  assert.deepEqual(Object.keys(h.nodeTypes()), ['a'])
})

test('a plugin ctx.emit lands in the events table', async () => {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sg-pl-')), 'sg.db'))
  const h = createHost({ baseDir, emit: createBus(db).emit, importModule: async () => ({ default: { id: 'base', register: (ctx) => void ctx.emit('hello', { n: 1 }) } }) })
  await h.load(['./base'])
  assert.deepEqual(db.eventsAfter(0).map((e) => [e.type, e.data]), [['hello', { n: 1 }]])
})

test('a check with a bad interval fails its plugin with a clear message', async () => {
  const h = createHost({ baseDir, importModule: async () => ({ default: { id: 'base', register: (ctx) => void ctx.registerCheck({ id: 'x', every: '5 minutes', run: () => ({ status: 'ok' }) }) } }) })
  await h.load(['./base'])
  assert.match(status(h).base!, /bad interval "5 minutes"/)
  assert.deepEqual(h.checks(), [])
})

test('ctx.http reaches only what the manifest permits, and substitutes only the secrets it lists', async () => {
  const server = http.createServer((req, res) => res.end(String(req.headers.authorization)))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  try {
    const client = createHttp({ secrets: createSecrets({ FX_TOKEN: 'tok-123456' }) })
    process.env.FX_URL = url
    const h = createHost({ baseDir, http: client })
    await h.load(['./fetcher'])
    assert.deepEqual(await h.checks()[0].run({ id: 'n', type: 't' }), { status: 'ok', detail: 'Bearer tok-123456' })
    // the same call from a plugin whose manifest has no permissions
    const bare = createHost({ baseDir, http: client, importModule: async () => ({ default: { id: 'base', register: (ctx) => void ctx.registerCheck({ id: 'x', every: '1m', run: async () => ({ status: 'ok', detail: await (await ctx.http(url, { allowPrivate: true })).text() }) }) } }) })
    await bare.load(['./base'])
    await assert.rejects(Promise.resolve(bare.checks()[0].run({ id: 'n', type: 't' })), /plugin base may not call 127\.0\.0\.1/)
  } finally { server.close() }
})
