import { useEffect, useState, useSyncExternalStore } from 'react'
import { clampViewport, type Viewport } from '../lib/view'
import { createFrames } from '../engine/frame'

// The map's own pan and zoom. Same feel as the d3-zoom React Flow used: wheel step, pinch, drag anchors, the van Wijk flight and cubic ease of setViewport.
type Pt = [number, number]
type Extent = [[number, number], [number, number]]
export interface Limits { w: number; h: number; min: number; max: number; extent: (zoom: number) => Extent }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const toWorld = (v: Viewport, p: Pt): Pt => [(p[0] - v.x) / v.zoom, (p[1] - v.y) / v.zoom]
// Put world point `w` under screen point `p` at `zoom`, inside the zoom limits and the pan extent (of the new zoom, so there is no overshoot and snap back).
export function place(zoom: number, p: Pt, w: Pt, l: Limits): Viewport {
  const k = clamp(zoom, l.min, l.max)
  return clampViewport({ zoom: k, x: p[0] - w[0] * k, y: p[1] - w[1] * k }, l.extent(k), l.w, l.h)
}

// d3-zoom's wheel step: zoom * 2^step. A trackpad pinch (ctrlKey) is ten times stronger on macOS.
export const wheelStep = (e: { deltaY: number; deltaMode: number; ctrlKey: boolean }, mac: boolean) =>
  -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey && mac ? 10 : 1)
export const wheelZoom = (zoom: number, e: Parameters<typeof wheelStep>[0], mac: boolean) => zoom * 2 ** wheelStep(e, mac)

export const CLICK_PX = 4 // a press that never strays further than this is a click
// One finger or the mouse drags (the world point grabbed stays under it); two pinch (zoom from their distance, the midpoint stays put). Anchors are kept
// as grabbed, so after the extent stopped the map the pointer has to come back before it moves again, as in d3-zoom.
export class Pointers {
  private a = new Map<number, { p: Pt; w: Pt }>()
  private start = new Map<number, Pt>()
  private far = false // some pointer strayed past CLICK_PX, or a second one joined
  private cur: () => Viewport
  private lim: () => Limits
  constructor(cur: () => Viewport, lim: () => Limits) { this.cur = cur; this.lim = lim }
  get size() { return this.a.size }
  has(id: number) { return this.a.has(id) }
  down(id: number, p: Pt) {
    if (this.a.size) this.far = true
    this.a.set(id, { p, w: toWorld(this.cur(), p) }); this.start.set(id, p)
  }
  // The viewport the pointers now ask for, or null for a pointer that is not down.
  move(id: number, p: Pt): Viewport | null {
    const a = this.a.get(id)
    if (!a) return null
    a.p = p
    const s = this.start.get(id)!
    if (Math.hypot(p[0] - s[0], p[1] - s[1]) > CLICK_PX) this.far = true
    const l = this.lim(), [q, r] = [...this.a.values()]
    if (!r) return place(this.cur().zoom, q.p, q.w, l)
    const k = Math.hypot(r.p[0] - q.p[0], r.p[1] - q.p[1]) / Math.hypot(r.w[0] - q.w[0], r.w[1] - q.w[1]) || this.cur().zoom
    return place(k, [(q.p[0] + r.p[0]) / 2, (q.p[1] + r.p[1]) / 2], [(q.w[0] + r.w[0]) / 2, (q.w[1] + r.w[1]) / 2], l)
  }
  // True when this was the last pointer up and the press was a click, not a drag or pinch.
  up(id: number): boolean {
    this.a.delete(id); this.start.delete(id)
    if (this.a.size) { for (const a of this.a.values()) a.w = toWorld(this.cur(), a.p); return false } // the one left keeps dragging from where it is
    const click = !this.far
    this.far = false
    return click
  }
}

// The flight setViewport made: d3-interpolate's van Wijk smooth zoom (rho = sqrt 2) around the pane centre, so a long move zooms out and back in.
const cosh = (x: number) => (Math.exp(x) + Math.exp(-x)) / 2, sinh = (x: number) => (Math.exp(x) - Math.exp(-x)) / 2, tanh = (x: number) => { const e = Math.exp(2 * x); return (e - 1) / (e + 1) }
export function flight(a: Viewport, b: Viewport, w: number, h: number): (t: number) => Viewport {
  const p: Pt = [w / 2, h / 2], W = Math.max(w, h), [ux0, uy0] = toWorld(a, p), [ux1, uy1] = toWorld(b, p), w0 = W / a.zoom, w1 = W / b.zoom
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, rho = Math.SQRT2
  let at: (t: number) => number[]
  if (d2 < 1e-12) {
    const S = Math.log(w1 / w0) / rho
    at = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)]
  } else {
    const d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + 4 * d2) / (4 * w0 * d1), b1 = (w1 * w1 - w0 * w0 - 4 * d2) / (4 * w1 * d1)
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), S = (r1 - r0) / rho
    at = (t) => { const s = t * S, u = (w0 / (2 * d1)) * (cosh(r0) * tanh(rho * s + r0) - sinh(r0)); return [ux0 + u * dx, uy0 + u * dy, (w0 * cosh(r0)) / cosh(rho * s + r0)] }
  }
  return (t) => { if (t >= 1) return b; const [ux, uy, ww] = at(t), k = W / ww; return { zoom: k, x: p[0] - ux * k, y: p[1] - uy * k } }
}
export const cubicInOut = (t: number) => ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2

interface Env { raf: (f: () => void) => number; caf: (id: number) => void; now: () => number }
// The frame owner: input and flights are applied at the top of its frame, then the canvas and the DOM layers apply the result (see engine/frame.ts).
export const frames = createFrames(() => viewport.get())
const browser: Env = { raf: (f) => frames.raf(f), caf: (id) => frames.caf(id), now: () => performance.now() }

// The viewport everyone reads: `set` is immediate, `request` is applied once per frame (input events coalesce), `animateTo` moves it over time.
export function createViewport(init: Viewport, env: Env = browser) {
  let cur = init, pend: Viewport | null = null, pendId = 0, anim: { id: number; end: () => void } | null = null
  const subs = new Set<(v: Viewport) => void>()
  const store = {
    size: { w: 1440, h: 900 }, // the pane, for the centre a flight turns around (kept current by MapView)
    get: () => cur,
    current: () => pend ?? cur, // where input should build on: what is asked for, even before the frame
    set(v: Viewport) {
      if (pendId) { env.caf(pendId); pendId = 0 }
      pend = null
      if (v.x === cur.x && v.y === cur.y && v.zoom === cur.zoom) return
      cur = v
      subs.forEach((f) => f(v))
    },
    request(v: Viewport) { pend = v; pendId ||= env.raf(() => { pendId = 0; if (pend) store.set(pend) }) },
    subscribe(f: (v: Viewport) => void) { subs.add(f); return () => { subs.delete(f) } },
    stop() { anim?.end(); anim = null }, // a new gesture or move takes over; the cancelled move resolves false
    // Resolves true when it arrives, false when something else took over.
    animateTo(to: Viewport, ms: number, ease: (t: number) => number = cubicInOut): Promise<boolean> {
      store.stop()
      if (!(ms > 0)) { store.set(to); return Promise.resolve(true) }
      const f = flight(store.current(), to, store.size.w, store.size.h), t0 = env.now()
      return new Promise((res) => {
        const tick = () => {
          const t = (env.now() - t0) / ms
          if (t >= 1) { anim = null; store.set(to); res(true) } else { store.set(f(ease(t))); anim!.id = env.raf(tick) }
        }
        anim = { id: env.raf(tick), end: () => { env.caf(anim!.id); res(false) } }
      })
    },
  }
  return store
}

export const viewport = createViewport({ x: 0, y: 0, zoom: 1 })
viewport.subscribe(frames.request)
export const useViewport = <T,>(pick: (v: Viewport) => T): T => useSyncExternalStore(viewport.subscribe, () => pick(viewport.get()))

// Mouse, touch and pen on the pane: drag, pinch, wheel. `pin` is the data-pin id under the first press (pins are DOM children of the pane).
export function bindPane(el: HTMLElement, store: ReturnType<typeof createViewport>, limits: () => Limits, on: { start: () => void; end: () => void; click: (pin: string | null) => void }) {
  const mac = navigator.userAgent.includes('Mac')
  const ptr = new Pointers(store.current, limits)
  const at = (e: { clientX: number; clientY: number }): Pt => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  let pin: string | null = null, wheel = 0, wheelPoint: Pt = [0, 0], wheelWorld: Pt = [0, 0]
  const move = (e: PointerEvent) => { const v = ptr.move(e.pointerId, at(e)); if (v) store.request(v) }
  const up = (e: PointerEvent) => {
    if (!ptr.has(e.pointerId)) return
    const click = ptr.up(e.pointerId) && e.type === 'pointerup'
    if (ptr.size) return
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up)
    el.classList.remove('dragging')
    on.end()
    if (click) on.click(pin)
  }
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && (e.button > 1 || e.ctrlKey)) return
    store.stop()
    if (!ptr.size) {
      pin = (e.target as Element).closest('[data-pin]')?.getAttribute('data-pin') ?? null
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up)
      el.classList.add('dragging')
      on.start()
    }
    ptr.down(e.pointerId, at(e))
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    store.stop()
    const p = at(e), v = store.current()
    const same = wheel && p[0] === wheelPoint[0] && p[1] === wheelPoint[1] // same spot: keep the world point the gesture grabbed
    if (!wheel) on.start(); else clearTimeout(wheel)
    if (!same) { wheelPoint = p; wheelWorld = toWorld(v, p) }
    wheel = window.setTimeout(() => { wheel = 0; on.end() }, 150)
    store.request(place(wheelZoom(v.zoom, e, mac), p, wheelWorld, limits()))
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('wheel', onWheel); clearTimeout(wheel); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up) }
}

// Labels and chip variables re-lay-out text on every change (about half of a pinch's main-thread time on a phone), so while the zoom moves they follow it in 8% steps
// (about the smallest change the eye reads on 9-17 px text; stepped like an old map) and snap to the exact zoom once it has rested for 200 ms.
export const STEP = 1.08
export const stepZoom = (z: number) => STEP ** Math.round(Math.log(z) / Math.log(STEP))
export function useSteppedZoom(): number {
  const [z, setZ] = useState(() => viewport.get().zoom)
  useEffect(() => {
    let timer = 0, last = viewport.get().zoom
    setZ(last)
    const off = viewport.subscribe(({ zoom }) => {
      if (zoom === last) return // a pan
      last = zoom
      setZ(stepZoom(zoom))
      clearTimeout(timer)
      timer = window.setTimeout(() => setZ(last), 200)
    })
    return () => { clearTimeout(timer); off() }
  }, [])
  return z
}
