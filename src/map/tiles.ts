import type { Scheme } from '../prefs'
import { viewOf, type TileView, type Viewport } from '../lib/view'
import type { WorldData } from '../world'

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

// Fly-to. While the camera travels, WorldLayer keeps its mounted tiles and level (no in-between tiles are requested or decoded).
// The destination's tiles are fetched and decoded up front and mounted at landing.
const held = new Map<string, HTMLImageElement>() // keeps decoded images alive until they are mounted; dedupes hover and click
const MAX_HELD = 96
export function preloadTiles(world: WorldData, scheme: Scheme, vp: Viewport, size: { w: number; h: number }) {
  const view = viewOf(vp, world.tiles.size, size, window.devicePixelRatio)
  const tex = world.textures?.[scheme]?.[view.level] // the paper under the tiles changes with the level too
  const srcs = wantOf(world, scheme, view).want.map((t) => t.src)
  if (tex) srcs.push(srcOf(tex))
  for (const src of srcs) {
    if (held.has(src)) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    img.decode().catch(() => {}) // a failed tile is simply mounted (and retried) at landing
    held.set(src, img)
    if (held.size > MAX_HELD) held.delete(held.keys().next().value!)
  }
}

// Over budget: drop unwanted tiles, off-screen ones first; sharper leftovers still on screen go last (the picture never gets blurrier while they fit).
export function evict(lru: Map<string, Tile>, wanted: Set<string>, { c0, c1, r0, r1 }: TileView, keep: number) {
  for (const any of [false, true]) for (const [k, t] of lru) if (lru.size > keep && !wanted.has(k) && (any || t.x < c0 || t.x > c1 || t.y < r0 || t.y > r1)) lru.delete(k)
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
