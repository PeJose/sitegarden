import type { Scheme } from '../prefs'
import { viewOf, type TileView, type Viewport } from '../lib/view'
import type { WorldData } from '../world'
import { ensure } from '../engine/bitmaps'

export interface Tile { z: number; x: number; y: number; src: string }
export const srcOf = (name: string) => `/a/${name}`
// The tile's file name; null when it is not rendered yet (or outside the grid).
export const nameAt = (tiles: WorldData['tiles'], theme: Scheme, z: number, x: number, y: number) => (x >= tiles.x0 && y >= tiles.y0 && x < tiles.x0 + tiles.cols && y < tiles.y0 + tiles.rows ? tiles.names[theme][z]?.[(y - tiles.y0) * tiles.cols + (x - tiles.x0)] : null)

// What a view needs: level 1 always sits under the sharper level, so zooming never shows a hole while it loads. `missing` are cells with no file yet.
export function wantOf(world: WorldData, scheme: Scheme, { level, c0, c1, r0, r1 }: TileView) {
  const want: Tile[] = [], missing: [number, number, number][] = []
  for (const z of level > 1 ? [1, level] : [1]) {
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
      const n = nameAt(world.tiles, scheme, z, x, y)
      if (n) want.push({ z, x, y, src: srcOf(n) })
      else if (n === null) missing.push([z, x, y])
    }
  }
  return { want, missing }
}

// Fly-to. While the camera travels, WorldLayer keeps its level (no in-between tiles are requested or decoded).
// The destination's tiles, preview and paper are fetched and decoded up front, so landing draws them at once.
export function preloadTiles(world: WorldData, scheme: Scheme, vp: Viewport, size: { w: number; h: number }) {
  const view = viewOf(vp, world.tiles.size, size, window.devicePixelRatio)
  for (const src of needs(world, scheme, view)) ensure(src)
}
// Everything a view draws from: its tiles, the whole-map preview and the paper texture of its level.
export const needs = (world: WorldData, scheme: Scheme, view: TileView) => {
  const tex = world.textures?.[scheme]?.[view.level], prev = world.previews[scheme]
  return [...wantOf(world, scheme, view).want.map((t) => t.src), ...(tex ? [srcOf(tex)] : []), ...(prev ? [srcOf(prev)] : [])]
}

export const flight = { active: false, timer: 0 as unknown as ReturnType<typeof setTimeout>, onEnd: new Set<() => void>() }
export function startFlight(ms: number) {
  flight.active = true
  clearTimeout(flight.timer)
  flight.timer = setTimeout(endFlight, ms + 150) // moveEnd normally ends it; this covers a zero-length move
}
// Landing, or the user took over: show the tiles of wherever the viewport is now.
export function endFlight() {
  if (!flight.active) return
  flight.active = false
  clearTimeout(flight.timer)
  flight.onEnd.forEach((f) => f())
}
