import assert from 'node:assert/strict'
import { test } from 'node:test'
import { overBudget } from './bitmaps'
import { snap } from './engine'
import { clipRect, paperUV } from './gl'

test('overBudget drops the least recently drawn first and never one drawn in the last frame', () => {
  const es = [{ key: 'a', px: 10, used: 1 }, { key: 'b', px: 10, used: 3 }, { key: 'c', px: 10, used: 5 }, { key: 'd', px: 10, used: 5 }]
  assert.deepEqual(overBudget(es, 40, 5), [])
  assert.deepEqual(overBudget(es, 25, 5), ['a', 'b']) // 40 -> 20, stops once it fits
  assert.deepEqual(overBudget(es, 0, 5), ['a', 'b']) // c and d were drawn in frame 5: kept even over budget
})

test('snap gives whole backing pixels that share edges between neighbours', () => {
  const f = { x: 13.3, y: -7.9, zoom: 0.37, dpr: 2.6 }
  const [x0, , w0] = snap(f, 0, 0, 512, 512), [x1, , w1] = snap(f, 512, 0, 512, 512)
  assert.equal(x0 + w0, x1)
  assert.ok(Number.isInteger(x0) && Number.isInteger(w1))
})

test('clipRect maps backing pixels to clip space, y up, and neighbours still share their edge', () => {
  assert.deepEqual(clipRect([0, 0, 200, 100], 200, 100), [-1, 1, 2, 2]) // the whole canvas
  assert.deepEqual(clipRect([50, 25, 100, 50], 200, 100), [-0.5, 0.5, 1, 1])
  const [l0, , w0] = clipRect([10, 0, 30, 10], 120, 10), [l1] = clipRect([40, 0, 30, 10], 120, 10)
  assert.ok(Math.abs(l0 + w0 - l1) < 1e-12)
})

test('paperUV is the visible world rect in repeat periods', () => {
  assert.deepEqual(paperUV([-512, 1024, 1536, 2048]), [-0.5, 1, 2, 1])
})
