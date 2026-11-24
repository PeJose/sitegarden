import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from './db'
import { createBus } from './events'
import { parseGraph } from './graph'
import { createHolder } from './holder'

test('an invalid save keeps the last good graph and emits config.invalid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-holder-')), file = path.join(dir, 'c.yaml')
  const bus = createBus(openDb(path.join(dir, 'sg.db')))
  const h = createHolder(() => parseGraph(fs.readFileSync(file, 'utf8'), file, { repo: {} }), bus.emit)
  const good = 'world: { seed: s }\ngroups: [{ id: g, label: G }]\nnodes: [{ id: a, type: repo, group: g }]\n'
  fs.writeFileSync(file, good)
  assert.equal(h.reload(), true)
  const first = h.get()
  fs.writeFileSync(file, good.replace('type: repo', 'type: spaceship'))
  assert.equal(h.reload(), false)
  assert.equal(h.get(), first)
  assert.deepEqual(bus.db.eventsAfter(0).map((e) => e.type), ['config.loaded', 'config.invalid'])
  assert.match((bus.db.eventsAfter(1)[0].data as { message: string }).message, /spaceship/)
  fs.writeFileSync(file, good)
  assert.equal(h.reload(), true)
  assert.notEqual(h.get(), first)
})
