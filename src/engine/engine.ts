import { beginFrame, trim } from './bitmaps'

// A 2D canvas drawn on demand: layers are drawn in `order` after `invalidate()`, in world coordinates (one transform set per frame).
export interface Frame { x: number; y: number; zoom: number; dpr: number; w: number; h: number; rect: [number, number, number, number] /* visible world rect x0 y0 x1 y1 */; now: number }
export interface Layer { id: string; order: number; draw(ctx: CanvasRenderingContext2D, f: Frame): void; animating?(): boolean }
export interface ViewportLike { get(): { x: number; y: number; zoom: number }; subscribe(f: (v: { x: number; y: number; zoom: number }) => void): () => void }
export interface Engine { addLayer(l: Layer): void; removeLayer(id: string): void; invalidate(): void; destroy(): void }

// A world rect as whole backing pixels [x, y, w, h] (neighbours share their edge, so no seam), for drawing with the identity transform.
export function snap(f: Pick<Frame, 'x' | 'y' | 'zoom' | 'dpr'>, x: number, y: number, w: number, h: number): [number, number, number, number] {
  const k = f.dpr * f.zoom, ox = f.dpr * f.x, oy = f.dpr * f.y
  const x0 = Math.round(ox + k * x), y0 = Math.round(oy + k * y)
  return [x0, y0, Math.round(ox + k * (x + w)) - x0, Math.round(oy + k * (y + h)) - y0]
}

export function createEngine(canvas: HTMLCanvasElement, viewport: ViewportLike): Engine {
  const ctx = canvas.getContext('2d')!
  const layers: Layer[] = []
  let raf = 0, w = 0, h = 0, dpr = 1
  const invalidate = () => { raf ||= requestAnimationFrame(frame) }
  // shortcut: devicePixelRatio is read at resize only, a browser zoom without a resize keeps the old density until the next one
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2); w = canvas.clientWidth; h = canvas.clientHeight
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    invalidate()
  }
  function frame(now: number) {
    raf = 0
    const { x, y, zoom } = viewport.get()
    const f: Frame = { x, y, zoom, dpr, w, h, rect: [-x / zoom, -y / zoom, (w - x) / zoom, (h - y) / zoom], now }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    beginFrame()
    for (const l of layers) {
      ctx.save()
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y)
      l.draw(ctx, f)
      ctx.restore()
    }
    trim()
    if (layers.some((l) => l.animating?.())) invalidate()
  }
  const ro = new ResizeObserver(size)
  ro.observe(canvas)
  size()
  const off = viewport.subscribe(invalidate)
  return {
    addLayer(l) { layers.push(l); layers.sort((a, b) => a.order - b.order); invalidate() },
    removeLayer(id) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); invalidate() },
    invalidate,
    destroy() { cancelAnimationFrame(raf); raf = 0; off(); ro.disconnect(); layers.length = 0 },
  }
}
