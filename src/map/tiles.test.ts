import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TileView } from '../lib/view'
import { evict, type Tile } from './tiles'

const view: TileView = { level: 1, c0: 0, c1: 1, r0: 0, r1: 0, rect: [] }
const tile = (z: number, x: number): [string, Tile] => [`${z}/${x}`, { z, x, y: 0, src: '' }]

test('evict drops off-screen tiles first and keeps sharper tiles that are still on screen', () => {
  const lru = new Map([tile(3, 0), tile(3, 1), tile(3, 7), tile(1, 0), tile(1, 1)]) // oldest first; level 3 on cells 0,1 is sharper than the wanted level 1
  evict(lru, new Set(['1/0', '1/1']), view, 4)
  assert.deepEqual([...lru.keys()], ['3/0', '3/1', '1/0', '1/1']) // only the off-screen 3/7 went
  evict(lru, new Set(['1/0', '1/1']), view, 3)
  assert.deepEqual([...lru.keys()], ['3/1', '1/0', '1/1']) // still over: the oldest on-screen leftover goes
  evict(lru, new Set(['1/0', '1/1']), view, 0)
  assert.deepEqual([...lru.keys()], ['1/0', '1/1']) // wanted tiles are never evicted
})
