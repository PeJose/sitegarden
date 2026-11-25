import assert from 'node:assert/strict'
import { test } from 'node:test'
import { minZoom, panExtent, type Viewport } from '../lib/view'
import { createViewport, cubicInOut, flight, Pointers, place, STEP, stepZoom, toWorld, wheelStep, wheelZoom, type Limits } from './viewport'

const b = { x: 0, y: 0, w: 4000, h: 3000 }
const W = 1000, H = 600
const lim: Limits = { w: W, h: H, min: minZoom(W, H, b), max: 2.5, extent: (z) => panExtent(b, W, z, false) }
const near = (a: number, e: number, eps = 1e-6) => assert.ok(Math.abs(a - e) < eps, `${a} vs ${e}`)

test('wheel step is d3-zoom\'s: 0.002 per pixel, 0.05 per line, pinch x10 on a Mac', () => {
  near(wheelStep({ deltaY: -100, deltaMode: 0, ctrlKey: false }, true), 0.2)
  near(wheelStep({ deltaY: -2, deltaMode: 1, ctrlKey: false }, false), 0.1)
  near(wheelStep({ deltaY: -1, deltaMode: 0, ctrlKey: true }, true), 0.02)
  near(wheelStep({ deltaY: -1, deltaMode: 0, ctrlKey: true }, false), 0.002)
  near(wheelZoom(1, { deltaY: -500, deltaMode: 0, ctrlKey: false }, false), 2)
})

test('zoom keeps the point under the cursor, within the zoom limits', () => {
  const v: Viewport = { x: -300, y: -200, zoom: 0.8 }, p: [number, number] = [420, 250], w = toWorld(v, p)
  const z = place(1.6, p, w, lim)
  near(z.zoom, 1.6); near(z.x + w[0] * z.zoom, p[0]); near(z.y + w[1] * z.zoom, p[1])
  near(place(99, p, w, lim).zoom, 2.5); near(place(0.0001, p, w, lim).zoom, lim.min)
})

test('dragging past the edge stops at the extent, never shows untiled area, and comes back through the grab point', () => {
  const v: Viewport = { x: -500, y: -400, zoom: 1 }
  const cur = { v }
  const ptr = new Pointers(() => cur.v, () => lim)
  ptr.down(1, [500, 300])
  const far = ptr.move(1, [9000, 9000])!
  const [[x0, y0], [x1, y1]] = lim.extent(1)
  near(far.x, -x0 * 1); near(far.y, -y0 * 1) // left and top edges of the extent at the screen's left and top
  cur.v = far
  const back = ptr.move(1, [-9000, -9000])!
  near(back.x, W - x1); near(back.y, H - y1)
  // the grab point is where it was grabbed: pointer back at the start gives the start viewport
  near(ptr.move(1, [500, 300])!.x, -500); near(ptr.move(1, [500, 300])!.y, -400)
})

test('pinch: the distance sets the zoom, the midpoint stays put', () => {
  const v: Viewport = { x: -300, y: -200, zoom: 1 }
  const ptr = new Pointers(() => v, () => lim)
  ptr.down(1, [400, 300]); ptr.down(2, [600, 300])
  const w = toWorld(v, [500, 300])
  const z = ptr.move(2, [800, 300])! // 200 px -> 400 px
  near(z.zoom, 2)
  near(z.x + w[0] * z.zoom, 600); near(z.y + w[1] * z.zoom, 300) // midpoint of 400 and 800 is 600
})

test('click vs drag', () => {
  const v = { x: -500, y: -400, zoom: 1 }
  const mk = () => new Pointers(() => v, () => lim)
  let p = mk(); p.down(1, [10, 10]); assert.equal(p.up(1), true)
  p = mk(); p.down(1, [10, 10]); p.move(1, [13, 12]); assert.equal(p.up(1), true) // 3.6 px: still a click
  p = mk(); p.down(1, [10, 10]); p.move(1, [30, 10]); assert.equal(p.up(1), false)
  p = mk(); p.down(1, [10, 10]); p.down(2, [50, 50]); assert.equal(p.up(2), false); assert.equal(p.up(1), false) // a pinch is never a click
  p = mk(); p.down(1, [10, 10]); p.move(1, [30, 10]); p.up(1); p.down(1, [10, 10]); assert.equal(p.up(1), true) // the next press starts clean
})

test('flight: ends are exact, a pure zoom is geometric, a long hop zooms out on the way', () => {
  const a: Viewport = { x: 0, y: 0, zoom: 1 }
  const f = flight(a, { x: -1500, y: -900, zoom: 4 }, W, H) // same centre
  assert.deepEqual(f(1), { x: -1500, y: -900, zoom: 4 }); near(f(0).zoom, 1); near(f(0.5).zoom, 2)
  const far = flight(a, { x: -9000, y: -6000, zoom: 1 }, W, H)
  assert.ok(far(0.5).zoom < 0.5)
  near(cubicInOut(0.5), 0.5); near(cubicInOut(0.25), 0.0625)
})

const clock = () => {
  const q = new Map<number, () => void>(); let id = 0, t = 0
  return { env: { raf: (f: () => void) => { q.set(++id, f); return id }, caf: (i: number) => { q.delete(i) }, now: () => t }, step: (dt: number) => { t += dt; const fs = [...q.values()]; q.clear(); fs.forEach((f) => f()) }, pending: () => q.size }
}

test('request applies once per frame, the last one wins', () => {
  const c = clock(), s = createViewport({ x: 0, y: 0, zoom: 1 }, c.env), seen: number[] = []
  s.subscribe((v) => seen.push(v.x))
  s.request({ x: 1, y: 0, zoom: 1 }); s.request({ x: 2, y: 0, zoom: 1 })
  assert.equal(s.current().x, 2); assert.equal(s.get().x, 0)
  c.step(16)
  assert.deepEqual(seen, [2])
})

test('animateTo arrives, and a new gesture or move cancels the running one', async () => {
  const c = clock(), s = createViewport({ x: 0, y: 0, zoom: 1 }, c.env)
  const done = s.animateTo({ x: -100, y: 0, zoom: 1 }, 100)
  c.step(50); assert.ok(s.get().x < 0 && s.get().x > -100)
  c.step(60); assert.equal(await done, true); assert.deepEqual(s.get(), { x: -100, y: 0, zoom: 1 })
  const first = s.animateTo({ x: -500, y: 0, zoom: 1 }, 100)
  c.step(20)
  const second = s.animateTo({ x: 0, y: 0, zoom: 1 }, 100) // a new move takes over
  assert.equal(await first, false)
  const mid = s.get().x
  s.stop() // a gesture takes over
  assert.equal(await second, false)
  c.step(500); assert.equal(s.get().x, mid); assert.equal(c.pending(), 0)
  assert.equal(await s.animateTo({ x: -7, y: 0, zoom: 1 }, 0), true); assert.equal(s.get().x, -7) // zero length: immediate
})

test('stepZoom snaps to 8% steps: neighbours share a step, a step apart differ, idempotent', () => {
  assert.equal(stepZoom(1), 1)
  assert.equal(stepZoom(1.02), stepZoom(1.0)) // inside one step
  assert.ok(stepZoom(1.5) / stepZoom(1.2) > 1.2) // distinct steps further apart
  for (const z of [0.3, 0.59, 1.7, 2.5]) { assert.equal(stepZoom(stepZoom(z)), stepZoom(z)); assert.ok(Math.abs(Math.log(stepZoom(z) / z)) <= Math.log(STEP) / 2 + 1e-9) } // never further than half a step off
})
