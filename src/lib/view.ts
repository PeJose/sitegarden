import type { Box, World } from '../gen/types'

// Shared by the client (what it opens to) and the server (which tiles to render first).
export const SCALE = [0.125, 0.5, 1, 2] // pixels per world unit at zoom level z; level 0 only feeds the whole-map preview
export const REF_SIZE = { w: 1440, h: 900 } // the window the server assumes for the first wave; other windows ask for what is missing

// Width of the hero panel that covers the map on desktop; on narrow screens it stacks above the map and covers nothing.
// Collapsed (the owner hid it) it covers nothing either.
export const heroInset = (w: number, collapsed = false) => (w >= 760 && !collapsed ? Math.min(480, w * 0.38) : 0)
// The map follows the sliding panel by this share of the open inset.
export const PULL = 0.3

// How far left of the world the pan extent reaches, so the world's left edge can travel out from under the hero panel.
const LEFT_REACH = 1024
// The one pan extent the client allows; the server tiles exactly this area (tiledBox), so no reachable pixel is untiled.
export const tiledBox = (b: World['bounds']): Box => [b.x - LEFT_REACH, b.y, b.x + b.w, b.y + b.h]
// Tight enough that the window never exceeds tiledBox (which would otherwise have to be recentred).
export const minZoom = (w: number, h: number, b: World['bounds']) => Math.max(w / (b.w + LEFT_REACH), h / b.h)

// The pan extent in the current panel state and zoom: the world plus, on its left, just enough room for the open panel to be cleared
// (collapsed: ~15% of the viewport), never more than LEFT_REACH and never less than the window needs (so minZoom holds in both states).
export function panExtent(b: World['bounds'], w: number, zoom: number, collapsed: boolean): [[number, number], [number, number]] {
  const reach = Math.min(LEFT_REACH, Math.max((collapsed ? 0.15 * w : heroInset(w)) / zoom, w / zoom - b.w))
  return [[b.x - reach, b.y], [b.x + b.w, b.y + b.h]]
}

// Clamp a viewport to the pan extent (what d3-zoom's constrain did), so animating to it never overshoots and snaps back.
export type Viewport = { x: number; y: number; zoom: number }
export function clampViewport(v: Viewport, [[x0, y0], [x1, y1]]: [[number, number], [number, number]], w: number, h: number): Viewport {
  const one = (p: number, lo: number, hi: number, size: number) => (hi - lo) * v.zoom < size ? size / 2 - ((lo + hi) / 2) * v.zoom : Math.min(-lo * v.zoom, Math.max(size - hi * v.zoom, p))
  return { ...v, x: one(v.x, x0, x1, w), y: one(v.y, y0, y1, h) }
}

// The first level sharp enough for this zoom and screen density.
export function levelFor(zoom: number, dpr: number): number {
  const fit = SCALE.findIndex((s) => s >= zoom * Math.min(3, dpr || 1) * 0.9)
  return Math.max(1, fit < 0 ? SCALE.length - 1 : fit)
}

// Frame all estates: on desktop in the area right of the hero text, on phones centred.
export function initialViewport(w: number, h: number, world: Pick<World, 'estates' | 'bounds'>, collapsed = false): { x: number; y: number; zoom: number } {
  const bb = world.estates.reduce<Box>((a, e) => [Math.min(a[0], e.bb[0]), Math.min(a[1], e.bb[1]), Math.max(a[2], e.bb[2]), Math.max(a[3], e.bb[3])], [Infinity, Infinity, -Infinity, -Infinity])
  const left = heroInset(w, collapsed)
  const min = minZoom(w, h, world.bounds)
  const desktop = w >= 760
  const availW = w - left - (desktop ? 40 : 0), availH = h - (desktop ? 160 : 0)
  const zoom = Math.max(min, Math.min(0.95, (0.92 * availW) / (bb[2] - bb[0]), (0.92 * availH) / (bb[3] - bb[1])), desktop ? 0 : Math.min(h / 640, w / 700))
  const { x, y, w: bw, h: bh } = world.bounds
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)) // never frame past the world edge
  const v = {
    zoom,
    x: clamp(left + availW / 2 - ((bb[0] + bb[2]) / 2) * zoom, w - (x + bw) * zoom, left - x * zoom),
    y: clamp((desktop ? 20 : 0) + (h - (desktop ? 160 : 0)) / 2 - ((bb[1] + bb[3]) / 2) * zoom, h - (y + bh) * zoom, -y * zoom),
  }
  return clampViewport(v, panExtent(world.bounds, w, zoom, collapsed), w, h) // exactly what the viewport allows, so the first interaction never moves it
}

// What TileLayer depends on: the level and the range of tile cells in view (rect is the exact viewport in world units, for the first wave only).
export interface TileView { level: number; c0: number; c1: number; r0: number; r1: number; rect: number[] }
export function viewOf({ x, y, zoom }: Viewport, T: number, size: { w: number; h: number }, dpr: number): TileView {
  const m = T / 2 // half a tile of margin so panning rarely waits
  const rx0 = -x / zoom - m, ry0 = -y / zoom - m, rx1 = (size.w - x) / zoom + m, ry1 = (size.h - y) / zoom + m
  return { level: levelFor(zoom, dpr), c0: Math.floor(rx0 / T), c1: Math.floor(rx1 / T), r0: Math.floor(ry0 / T), r1: Math.floor(ry1 / T), rect: [rx0, ry0, rx1, ry1] }
}
