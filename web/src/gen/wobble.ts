import { f1 } from './geom'

// Hand-drawn wobble as geometry. It replaces the displacement filter on thin strokes: a filter pass costs per pixel of its whole
// region (most of a tile) while the strokes themselves are nearly free, and the strokes stay sharp at every zoom level.
// The offset is a pure function of the position, so tiles and layers that overlap agree on where a line runs.
const hash = (x: number, y: number, s: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

const STEP = 5, PERIOD = 11, AMP = 2.2
// Absolute M/L/H/V/C path data in, wobbled polyline data out.
export function wobble(d: string): string {
  let out = '', cx = 0, cy = 0
  const put = (x: number, y: number, first: boolean) => {
    const wx = x + (noise(x / PERIOD, y / PERIOD, 1) * 2 - 1) * AMP, wy = y + (noise(x / PERIOD, y / PERIOD, 2) * 2 - 1) * AMP
    out += `${first ? 'M' : 'L'}${f1(wx)} ${f1(wy)}`
  }
  const line = (x: number, y: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) / STEP))
    for (let i = 1; i <= n; i++) put(cx + ((x - cx) * i) / n, cy + ((y - cy) * i) / n, false)
    cx = x; cy = y
  }
  for (const [, cmd, args] of d.matchAll(/([MLHVC])([^MLHVC]*)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number)
    if (cmd === 'M') { cx = n[0]; cy = n[1]; put(cx, cy, true) }
    else if (cmd === 'L') line(n[0], n[1])
    else if (cmd === 'H') line(n[0], cy)
    else if (cmd === 'V') line(cx, n[0])
    else {
      const [x1, y1, x2, y2, x, y] = n, k = Math.max(2, Math.ceil(Math.hypot(x - cx, y - cy) / STEP))
      for (let i = 1; i <= k; i++) {
        const t = i / k, u = 1 - t
        put(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y, false)
      }
      cx = x; cy = y
    }
  }
  return out
}
