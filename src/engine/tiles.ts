import type { Scheme } from '../prefs'
import type { WorldData } from '../world'
import { SCALE } from '../lib/view'
import { nameAt, srcOf } from '../map/tiles'
import { cached, touch } from './bitmaps'
import { snap, type Layer } from './engine'

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

declare global { interface Window { __sgTiles?: { drawn: number; cached: number; lastDrawMs: number } } }

// Paper, then the whole-map preview, then the tiles, all from decoded bitmaps. The owner feeds it `set` and calls engine.invalidate().
export function tileLayer(): Layer & { set(s: TileState): void } {
  let s: TileState | null = null
  let texSrc = '' // the last paper texture seen: kept drawing until the new one is decoded
  let pat: { bmp: ImageBitmap; p: CanvasPattern } | null = null
  return {
    id: 'tiles', order: 10,
    set(next) { s = next },
    draw(ctx, f) {
      if (!s) return
      const t0 = performance.now(), { world, scheme, level } = s, { tiles, previews, textures } = world, T = tiles.size
      const has = (src: string) => !!touch(src)
      const cells: [number, number, string][] = []
      let hole = false // a visible cell without a decoded tile (or outside the grid): paper and preview show there, otherwise they are fully covered and not drawn
      for (let y = Math.floor(f.rect[1] / T); y <= Math.floor(f.rect[3] / T); y++) for (let x = Math.floor(f.rect[0] / T); x <= Math.floor(f.rect[2] / T); x++) {
        const src = pick(tiles, scheme, level, x, y, has)
        if (src) cells.push([x, y, src]); else hole = true
      }
      const want = textures?.[scheme]?.[level]
      if (want && touch(srcOf(want))) texSrc = srcOf(want)
      const tex = hole && texSrc ? touch(texSrc) : undefined
      if (tex) {
        if (pat?.bmp !== tex) { const p = ctx.createPattern(tex, 'repeat')!; p.setTransform(new DOMMatrix().scale(patternScale(tex.width))); pat = { bmp: tex, p } }
        ctx.fillStyle = pat.p
        ctx.fillRect(f.rect[0] - 1, f.rect[1] - 1, f.rect[2] - f.rect[0] + 2, f.rect[3] - f.rect[1] + 2)
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0) // from here whole backing pixels
      const prev = hole && previews[scheme] && touch(`/a/${previews[scheme]}`)
      if (prev) ctx.drawImage(prev, ...snap(f, tiles.x0 * T, tiles.y0 * T, tiles.cols * T, tiles.rows * T))
      for (const [x, y, src] of cells) ctx.drawImage(touch(src)!, ...snap(f, x * T, y * T, T, T))
      const drawn = cells.length
      window.__sgTiles = { drawn, cached: cached(), lastDrawMs: performance.now() - t0 } // read by e2e only
    },
  }
}
