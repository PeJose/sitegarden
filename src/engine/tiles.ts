import type { Scheme } from '../prefs'
import type { WorldData } from '../world'
import { SCALE } from '../lib/view'
import { nameAt, srcOf } from '../map/tiles'
import { cached, touch } from './bitmaps'
import { snap, type Frame, type Layer } from './engine'
import { clipRect, paperUV } from './gl'

export interface TileState { world: WorldData; scheme: Scheme; level: number }

// The tile to draw for a cell: the sharpest decoded one up to one level above the settled one (so zooming in is not blurry while it loads),
// falling back to coarser ones. Tiles are opaque, so one draw per cell covers every coarser one (and a cell never goes blurrier while a sharper bitmap is cached).
export function pick(tiles: WorldData['tiles'], scheme: Scheme, level: number, x: number, y: number, has: (src: string) => boolean): string | undefined {
  for (let z = Math.min(level + 1, SCALE.length - 1); z >= 1; z--) {
    const n = nameAt(tiles, scheme, z, x, y)
    if (n && has(srcOf(n))) return srcOf(n)
  }
}
// The paper texture repeats every 1024 world units whatever its pixel size.
export const patternScale = (bitmapWidth: number) => 1024 / bitmapWidth

declare global { interface Window { __sgTiles?: { drawn: number; cached: number; lastDrawMs: number; view: { x: number; y: number; zoom: number }; gl: boolean } } }

// Paper, then the whole-map preview, then the tiles, all from decoded bitmaps (WebGL2 textures, or 2D canvas drawImage as the fallback).
// The owner feeds it `set` and calls engine.invalidate().
export function tileLayer(): Layer & { set(s: TileState): void } {
  let s: TileState | null = null
  let texSrc = '' // the last paper texture seen: kept drawing until the new one is decoded
  let pat: { bmp: ImageBitmap; p: CanvasPattern } | null = null
  // What this frame draws: the cells with a decoded tile, and the preview and paper only where a cell has none (otherwise they are fully covered).
  function plan(f: Frame) {
    if (!s) return
    const { world, scheme, level } = s, { tiles, previews, textures } = world, T = tiles.size
    const has = (src: string) => !!touch(src)
    const cells: [number, number, ImageBitmap][] = []
    let hole = false // a visible cell without a decoded tile (or outside the grid)
    for (let y = Math.floor(f.rect[1] / T); y <= Math.floor(f.rect[3] / T); y++) for (let x = Math.floor(f.rect[0] / T); x <= Math.floor(f.rect[2] / T); x++) {
      const src = pick(tiles, scheme, level, x, y, has)
      if (src) cells.push([x, y, touch(src)!]); else hole = true
    }
    const want = textures?.[scheme]?.[level]
    if (want && touch(srcOf(want))) texSrc = srcOf(want)
    const tex = hole && texSrc ? touch(texSrc) : undefined
    const prev = hole && previews[scheme] ? touch(`/a/${previews[scheme]}`) : undefined
    return { T, cells, tex, prev, tiles, t0: performance.now() }
  }
  const done = (f: Frame, drawn: number, t0: number, gl: boolean) => { window.__sgTiles = { drawn, cached: cached(), lastDrawMs: performance.now() - t0, view: { x: f.x, y: f.y, zoom: f.zoom }, gl } } // read by e2e only
  return {
    id: 'tiles', order: 10,
    set(next) { s = next },
    draw(ctx, f) {
      const p = plan(f)
      if (!p) return
      const { T, cells, tex, prev, tiles } = p
      if (tex) {
        if (pat?.bmp !== tex) { const q = ctx.createPattern(tex, 'repeat')!; q.setTransform(new DOMMatrix().scale(patternScale(tex.width))); pat = { bmp: tex, p: q } }
        ctx.fillStyle = pat.p
        ctx.fillRect(f.rect[0] - 1, f.rect[1] - 1, f.rect[2] - f.rect[0] + 2, f.rect[3] - f.rect[1] + 2)
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0) // from here whole backing pixels
      if (prev) ctx.drawImage(prev, ...snap(f, tiles.x0 * T, tiles.y0 * T, tiles.cols * T, tiles.rows * T))
      for (const [x, y, bmp] of cells) ctx.drawImage(bmp, ...snap(f, x * T, y * T, T, T))
      done(f, cells.length, p.t0, false)
    },
    drawGL(g, f) {
      const p = plan(f)
      if (!p) return
      const { T, cells, tex, prev, tiles } = p, W = Math.round(f.w * f.dpr), H = Math.round(f.h * f.dpr)
      if (tex) g.draw(tex, [-1, 1, 2, 2], paperUV(f.rect), true)
      if (prev) g.draw(prev, clipRect(snap(f, tiles.x0 * T, tiles.y0 * T, tiles.cols * T, tiles.rows * T), W, H))
      for (const [x, y, bmp] of cells) g.draw(bmp, clipRect(snap(f, x * T, y * T, T, T), W, H))
      done(f, cells.length, p.t0, true)
    },
  }
}
