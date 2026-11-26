import { beginFrame, trim } from './bitmaps'
import type { Frames } from './frame'
import { createGL, type GL } from './gl'

// A canvas drawn on demand in the frame owner's frame (WebGL2, or 2D when it is unavailable): layers are drawn in `order` after `invalidate()`, in world coordinates.
export interface Frame { x: number; y: number; zoom: number; dpr: number; w: number; h: number; rect: [number, number, number, number] /* visible world rect x0 y0 x1 y1 */; now: number }
export interface Layer { id: string; order: number; draw(ctx: CanvasRenderingContext2D, f: Frame): void; drawGL(g: GL, f: Frame): void; animating?(): boolean }
export interface Engine { addLayer(l: Layer): void; removeLayer(id: string): void; invalidate(): void; destroy(): void }

// A world rect as whole backing pixels [x, y, w, h] (neighbours share their edge, so no seam), for drawing with the identity transform.
export function snap(f: Pick<Frame, 'x' | 'y' | 'zoom' | 'dpr'>, x: number, y: number, w: number, h: number): [number, number, number, number] {
  const k = f.dpr * f.zoom, ox = f.dpr * f.x, oy = f.dpr * f.y
  const x0 = Math.round(ox + k * x), y0 = Math.round(oy + k * y)
  return [x0, y0, Math.round(ox + k * (x + w)) - x0, Math.round(oy + k * (y + h)) - y0]
}

// `gl: false` forces the 2D path; `onLost` fires when a lost WebGL context has not come back within 2 s (the owner swaps in a fresh canvas with `gl: false`).
export function createEngine(canvas: HTMLCanvasElement, frames: Frames, opts: { gl?: boolean; onLost?: () => void } = {}): Engine {
  let timer = 0
  const g = opts.gl === false ? null : createGL(canvas, { restored: () => { clearTimeout(timer); invalidate() }, lost: () => { timer = window.setTimeout(() => opts.onLost?.(), 2000) } })
  const ctx = g ? null : canvas.getContext('2d')!
  const layers: Layer[] = []
  let w = 0, h = 0, dpr = 1
  const invalidate = () => frames.request()
  const draw = ({ x, y, zoom }: { x: number; y: number; zoom: number }, now: number) => {
    if (g?.lost) return
    const f: Frame = { x, y, zoom, dpr, w, h, rect: [-x / zoom, -y / zoom, (w - x) / zoom, (h - y) / zoom], now }
    beginFrame()
    if (g) {
      g.begin(canvas.width, canvas.height)
      for (const l of layers) l.drawGL(g, f)
    } else if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingQuality = 'high'
      for (const l of layers) {
        ctx.save()
        ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y)
        l.draw(ctx, f)
        ctx.restore()
      }
    }
    const log = (window as unknown as { __sgAlpha?: number[] }).__sgAlpha // e2e only: the centre pixel after every draw
    if (log) log.push(g ? g.alpha() : ctx!.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data[3])
    trim()
    if (layers.some((l) => l.animating?.())) frames.again()
  }
  // shortcut: devicePixelRatio is read at resize only, a browser zoom without a resize keeps the old density until the next one
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2); w = canvas.clientWidth; h = canvas.clientHeight
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) // clears the canvas: redraw before it is painted
    draw(frames.view(), performance.now())
  }
  const ro = new ResizeObserver(size)
  ro.observe(canvas)
  size()
  const off = frames.onFrame(draw)
  return {
    addLayer(l) { layers.push(l); layers.sort((a, b) => a.order - b.order); invalidate() },
    removeLayer(id) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); invalidate() },
    invalidate,
    destroy() { clearTimeout(timer); off(); ro.disconnect(); g?.destroy(); layers.length = 0 },
  }
}
