import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampViewport, initialViewport, levelFor, panExtent, viewOf } from './view'

const ext: [[number, number], [number, number]] = [[-100, 0], [900, 600]]
test('clampViewport keeps the window inside the extent', () => {
  assert.deepEqual(clampViewport({ x: 500, y: 50, zoom: 1 }, ext, 400, 300), { x: 100, y: -0, zoom: 1 }) // left limit: x <= -x0*zoom
  assert.deepEqual(clampViewport({ x: -900, y: -500, zoom: 1 }, ext, 400, 300), { x: -500, y: -300, zoom: 1 }) // right limit: x >= w - x1*zoom
  assert.deepEqual(clampViewport({ x: -50, y: -20, zoom: 1 }, ext, 400, 300), { x: -50, y: -20, zoom: 1 }) // inside: untouched
  assert.equal(clampViewport({ x: 0, y: 0, zoom: 0.2 }, ext, 400, 300).x, 200 - 400 * 0.2) // extent smaller than window: centred
})

test('initialViewport is already inside the pan extent, open and collapsed', () => {
  const world = { bounds: { x: 0, y: 0, w: 6000, h: 4000 }, estates: [{ bb: [1500, 1000, 3000, 2200] }, { bb: [3400, 1800, 4200, 2600] }] } as unknown as Parameters<typeof initialViewport>[2]
  for (const [w, h] of [[1440, 900], [1030, 900], [1920, 1080], [800, 600], [390, 800]]) for (const collapsed of [false, true]) {
    const v = initialViewport(w, h, world, collapsed)
    assert.deepEqual(clampViewport(v, panExtent(world.bounds, w, v.zoom, collapsed), w, h), v)
  }
})

test('levelFor counts density up to 2 (a phone at 3 asks for the same level as 2)', () => {
  for (const z of [0.1, 0.39, 0.6, 1, 1.5, 2.5]) assert.equal(levelFor(z, 3), levelFor(z, 2))
  assert.equal(levelFor(0.39, 1), 1) // desktop unchanged
  assert.equal(levelFor(0.39, 2), 2)
  assert.equal(levelFor(0.6, 2), 3)
})

test('viewOf keeps the settled level while the zoom moves, and follows the zoom without one', () => {
  const size = { w: 390, h: 844 }
  assert.equal(viewOf({ x: 0, y: 0, zoom: 2 }, 512, size, 2, 1).level, 1)
  assert.equal(viewOf({ x: 0, y: 0, zoom: 2 }, 512, size, 2).level, 3)
  assert.equal(viewOf({ x: 0, y: 0, zoom: 2 }, 512, size, 2, 1).c1, viewOf({ x: 0, y: 0, zoom: 2 }, 512, size, 2).c1) // the cell range follows the view either way
})
