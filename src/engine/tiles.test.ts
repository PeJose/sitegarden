import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WorldData } from '../world'
import { patternScale, pick } from './tiles'

const names = (z: number) => [`l${z}a`, `l${z}b`]
const tiles = { size: 512, x0: 0, y0: 0, cols: 2, rows: 1, names: { light: [names(0), names(1), names(2), names(3)], night: [[], [], [], []] } } as unknown as WorldData['tiles']
const has = (...srcs: string[]) => (s: string) => srcs.includes(s)

test('pick takes the sharpest decoded tile up to one level above the settled one', () => {
  const all = has('/a/l1a', '/a/l2a', '/a/l3a')
  assert.equal(pick(tiles, 'light', 1, 0, 0, all), '/a/l2a') // level 3 is too sharp for level 1
  assert.equal(pick(tiles, 'light', 3, 0, 0, all), '/a/l3a')
})

test('pick falls back to what is decoded, and skips cells outside the grid', () => {
  assert.equal(pick(tiles, 'light', 2, 0, 0, has('/a/l1a')), '/a/l1a')
  assert.equal(pick(tiles, 'light', 2, 1, 0, has('/a/l1a')), undefined)
  assert.equal(pick(tiles, 'light', 2, 5, 0, has('/a/l1a')), undefined)
})

test('the paper pattern repeats every 1024 world units whatever the texture size', () => {
  assert.equal(patternScale(2048), 0.5)
  assert.equal(patternScale(128), 8)
})
