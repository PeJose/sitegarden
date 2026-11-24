import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { rngFor } from '../src/gen/rng'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cfg-'))
process.env.SITEGARDEN_DATA = dir // before store.ts and config.ts load
process.env.SITEGARDEN_CONFIG = path.join(dir, 'sitegarden.yaml')
const root = path.join(import.meta.dirname, '..')
fs.writeFileSync(process.env.SITEGARDEN_CONFIG, fs.readFileSync(path.join(root, 'sitegarden.yaml'), 'utf8').replace('./plugins/', `${root}/plugins/`))
const { addEstate, loadConfig, loadGraph, removeLastEstate } = await import('./config')
const { makeEstate } = await import('./mock')

test('planting adds a group with its nodes and edges, removing takes them out again, comments stay', async () => {
  const before = await loadConfig(), g0 = await loadGraph()
  const e = makeEstate(rngFor('cfg-test'), before.estates.map((x) => x.id))
  addEstate(e)
  const after = await loadConfig()
  assert.equal(after.estates.length, before.estates.length + 1)
  assert.deepEqual(after.estates.at(-1), e)
  assert.equal((await loadGraph()).nodes.length, g0.nodes.length + e.nodes.length)
  assert.equal(removeLastEstate(), e.id)
  assert.deepEqual(await loadConfig(), before)
  assert.match(fs.readFileSync(process.env.SITEGARDEN_CONFIG!, 'utf8'), /# yaml-language-server.*\n# Sitegarden config/)
})

test('the last estate cannot be removed', async () => {
  while (removeLastEstate());
  assert.equal((await loadGraph()).groups.length, 1)
})
