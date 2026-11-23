import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { rngFor } from '../src/gen/rng'

process.env.SITEGARDEN_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-test-')) // before store.ts loads
const { loadConfig } = await import('./config')
const { computePlan, firstWave, initialView, missing, order, T, SCALE, THEMES } = await import('./plan')
const { levelFor, minZoom, panExtent, tiledBox } = await import('../src/lib/view')
const { makeEstate } = await import('./mock')
const { art } = await import('./store')

const cfg = loadConfig()
const names = (p: Awaited<ReturnType<typeof computePlan>>) => new Set([...p.jobs.map((j) => j.name), ...p.tiles.map((t) => t.name)])

test('the same config gives identical artifact hashes and release id', () => {
  const a = computePlan(cfg, {}), b = computePlan(cfg, {})
  assert.equal(a.id, b.id)
  assert.deepEqual(a.jobs.map((j) => j.name), b.jobs.map((j) => j.name))
  assert.deepEqual(a.tiles.map((t) => t.name), b.tiles.map((t) => t.name))
})

test('adding an estate re-renders only what it touches', () => {
  const a = computePlan(cfg, {})
  const b = computePlan({ ...cfg, estates: [...cfg.estates, makeEstate(rngFor('plan-test'), cfg.estates.map((e) => e.id))] }, a.world.positions)
  const before = names(a), fresh = b.jobs.filter((j) => !before.has(j.name)), freshTiles = b.tiles.filter((t) => !before.has(t.name))
  assert.ok(fresh.some((j) => j.kind === 'estate'))
  assert.ok(!fresh.some((j) => j.kind === 'texture'), 'the texture is position independent')
  for (const e of a.world.estates) assert.ok(a.jobs.filter((j) => j.kind === 'estate').every((j) => names(b).has(j.name)), `estate layers of ${e.id} are reused`)
  assert.ok(freshTiles.length > 0 && freshTiles.length < b.tiles.length * 0.7, `${freshTiles.length} of ${b.tiles.length} tiles changed`) // the map is only ~7x7 tiles and an estate's halo reaches ~1000 units
  assert.ok(fresh.filter((j) => j.kind === 'terrain').length < b.jobs.filter((j) => j.kind === 'terrain').length * 0.7, 'distant terrain is reused')
})

test('nothing is left to render once every artifact exists', () => {
  const p = computePlan(cfg, {})
  assert.ok(missing(p).jobs.length > 0)
  for (const n of names(p)) fs.writeFileSync(art(n), '')
  assert.deepEqual([missing(p).jobs.length, missing(p).tiles.length], [0, 0])
})

test('the first wave is the preview plus only the tiles of the initial view, light theme', () => {
  const p = computePlan(cfg, {}), v = initialView(p), wave = firstWave(p), sharp = wave.filter((t) => t.z > 0)
  assert.ok(wave.every((t) => t.theme === 'light'))
  assert.ok(sharp.length > 0 && sharp.every((t) => t.z === v.z && v.has(t.x, t.y)))
  assert.equal(wave.filter((t) => t.z === 0).length, p.grid.cols * p.grid.rows, 'every preview tile')
  assert.ok(sharp.length < p.grid.cols * p.grid.rows, 'not the whole level')
  // and the render order starts with exactly those, before any neighbour or night tile
  const head = order(p).slice(0, wave.length)
  assert.deepEqual(new Set(head.map((t) => t.name)), new Set(wave.map((t) => t.name)))
})

test('every tile the client can request inside its pan extent is in the plan, in both panel states and at DPR 1 and 2', () => {
  const p = computePlan(cfg, {}), have = new Set(p.tiles.map((t) => `${t.theme}/${t.z}/${t.x}/${t.y}`)), b = p.world.bounds, [tx0, ty0, tx1, ty1] = tiledBox(b)
  for (const [w, h] of [[1440, 900], [1030, 900], [760, 1200], [390, 800], [3000, 700]]) {
    const z0 = minZoom(w, h, b)
    for (const collapsed of [false, true]) for (const dpr of [1, 2]) for (const zoom of [z0, 0.5, 1, 2.5].map((k) => Math.max(k, z0))) {
      const [[x0, y0], [x1, y1]] = panExtent(b, w, zoom, collapsed), vw = w / zoom, vh = h / zoom, m = T / 2 // the client also asks for half a tile around the viewport
      assert.ok(vw <= x1 - x0 + 1e-6 && vh <= y1 - y0 + 1e-6, `${w}x${h} fits the extent at zoom ${zoom}`)
      assert.ok(x0 >= tx0 && y0 >= ty0 && x1 <= tx1 && y1 <= ty1, 'the pan extent lies inside the tiled box')
      for (const [vx, vy] of [[x0, y0], [x1 - vw, y1 - vh], [x0, y1 - vh], [x1 - vw, y0]]) // viewport panned to each corner of the extent
        for (const lv of new Set([1, levelFor(zoom, dpr)]))
          for (let ty = Math.floor((vy - m) / T); ty <= Math.floor((vy + vh + m) / T); ty++) for (let tx = Math.floor((vx - m) / T); tx <= Math.floor((vx + vw + m) / T); tx++)
            if (tx >= p.grid.x0 && ty >= p.grid.y0 && tx < p.grid.x0 + p.grid.cols && ty < p.grid.y0 + p.grid.rows) // outside the grid the client asks for nothing
              for (const th of THEMES) assert.ok(have.has(`${th}/${lv}/${tx}/${ty}`), `${th}/${lv}/${tx}/${ty}`)
      // and what the viewport itself shows is inside the grid
      for (const [vx, vy] of [[x0, y0], [x1 - vw, y1 - vh]]) assert.ok(Math.floor(vx / T) >= p.grid.x0 && Math.floor(vy / T) >= p.grid.y0 && Math.floor((vx + vw - 1e-6) / T) < p.grid.x0 + p.grid.cols && Math.floor((vy + vh - 1e-6) / T) < p.grid.y0 + p.grid.rows, `${w}x${h} z${zoom} inside the grid`)
    }
  }
  assert.equal(SCALE.length, 4)
})
