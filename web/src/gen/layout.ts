import { range, rngFor } from './rng'
import type { Positions, Pt } from './types'

const GOLDEN = 2.39996323

// Estates sit on a seeded spiral around the first one, in creation order. A saved position is kept while it still clears the
// estates before it (plot sizes can change between versions); otherwise, like an unsaved estate, it walks outward along its spiral ray until it clears them.
export function layout(seed: string, estates: { id: string; poly: Pt[] }[], saved: Positions): Positions {
  const out: Positions = {}
  const placed: { x: number; y: number; poly: Pt[] }[] = []
  // closest approach of two outlines (sampled points), so elongated plots can sit close without overlapping
  const gap = (a: { x: number; y: number; poly: Pt[] }, b: { x: number; y: number; poly: Pt[] }) =>
    Math.min(...a.poly.flatMap((p) => b.poly.map((q) => Math.hypot(p[0] + a.x - q[0] - b.x, p[1] + a.y - q[1] - b.y))))
  const a0 = rngFor(seed, 'spiral')() * 2 * Math.PI
  estates.forEach((e, i) => {
    const fits = (p: { x: number; y: number }) => placed.every((q) => gap(q, { ...p, poly: e.poly }) > 90)
    let pos = saved[e.id]
    if (!pos || !fits(pos)) {
      if (!placed.length) pos = { x: 0, y: 0 }
      else {
        const ang = a0 + i * GOLDEN + range(rngFor(seed, e.id, 'pos'), -0.25, 0.25)
        const c = { x: 0, y: 0 }
        pos = c
        for (let d = 0; d < 6000; d += 20) {
          pos = { x: Math.round(Math.cos(ang) * d), y: Math.round(Math.sin(ang) * d) }
          if (fits(pos)) break
        }
      }
    }
    out[e.id] = pos
    placed.push({ ...pos, poly: e.poly })
  })
  return out
}
