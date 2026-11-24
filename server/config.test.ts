import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { rngFor } from '../src/gen/rng'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cfg-'))
process.env.SITEGARDEN_DATA = dir // before store.ts and config.ts load
process.env.SITEGARDEN_CONFIG = path.join(dir, 'sitegarden.yaml')
fs.copyFileSync(path.join(import.meta.dirname, '../sitegarden.yaml'), process.env.SITEGARDEN_CONFIG)
const { addEstate, loadConfig, loadGraph, removeLastEstate } = await import('./config')
const { makeEstate } = await import('./mock')

test('planting adds a group with its nodes and edges, removing takes them out again, comments stay', () => {
  const before = loadConfig(), g0 = loadGraph()
  const e = makeEstate(rngFor('cfg-test'), before.estates.map((x) => x.id))
  addEstate(e)
  const after = loadConfig()
  assert.equal(after.estates.length, before.estates.length + 1)
  assert.deepEqual(after.estates.at(-1), e)
  assert.equal(loadGraph().nodes.length, g0.nodes.length + e.nodes.length)
  assert.equal(removeLastEstate(), e.id)
  assert.deepEqual(loadConfig(), before)
  assert.match(fs.readFileSync(process.env.SITEGARDEN_CONFIG!, 'utf8'), /^# Sitegarden config/)
})

test('the last estate cannot be removed', () => {
  while (removeLastEstate());
  assert.equal(loadGraph().groups.length, 1)
})
