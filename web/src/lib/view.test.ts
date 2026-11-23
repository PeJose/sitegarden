import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampViewport, initialViewport, panExtent } from './view'

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
