import type { Box, Pt } from './types'

export const f1 = (n: number) => Math.round(n * 10) / 10
export const rot = ([x, y]: Pt, a: number, [cx, cy]: Pt): Pt => {
  const c = Math.cos(a), s = Math.sin(a)
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}

// Closed Catmull-Rom spline through pts, as cubic bezier path data plus a dense polyline of the same curve.
export function smooth(pts: Pt[]): { d: string; poly: Pt[] } {
  const n = pts.length
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`
  const poly: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`
    for (let k = 0; k < 6; k++) {
      const t = k / 6, u = 1 - t
      poly.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]])
    }
  }
  return { d: d + ' Z', poly }
}

export function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

export const distSeg = (x: number, y: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
}
export const distPoly = (poly: Pt[], x: number, y: number) => poly.reduce((m, p, i) => Math.min(m, distSeg(x, y, p, poly[(i + 1) % poly.length])), Infinity)
export const distPath = (pts: Pt[], x: number, y: number) => pts.reduce((m, p, i) => (i ? Math.min(m, distSeg(x, y, pts[i - 1], p)) : m), Infinity)

export const bboxOf = (pts: Pt[]): Box => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
export const hit = (a: Box, b: Box, pad = 0) => a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad
export const union = (bs: Box[]): Box => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))]

// Cubic bezier sampled into a polyline.
export function bezier(a: Pt, c1: Pt, c2: Pt, b: Pt, n = 16): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]] as Pt
  })
}

export const grow = (b: Box, p: number): Box => [b[0] - p, b[1] - p, b[2] + p, b[3] + p]
export const boxPoly = (b: Box): Pt[] => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]
export const rectPoly = (cx: number, cy: number, w: number, h: number, r: number): Pt[] =>
  ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map((p) => { const q = rot(p, r, [0, 0]); return [q[0] + cx, q[1] + cy] as Pt })
// Separating-axis test for two convex polygons; touching edges do not count as a hit.
export function polysHit(A: Pt[], B: Pt[]): boolean {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length]
    const nx = y0 - y1, ny = x1 - x0
    const pa = A.map((q) => q[0] * nx + q[1] * ny), pb = B.map((q) => q[0] * nx + q[1] * ny)
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
  }
  return true
}
