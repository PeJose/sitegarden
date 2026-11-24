import { grow, boxPoly, polysHit, distPoly, inside } from './geom'
import type { Box, Pt } from './types'

export type Align = 'start' | 'end' | 'center'
export interface Chip { box: Box; align: Align }

export const WORD: Record<string, string> = { cms: 'Studio', repo: 'Repo', site: 'Site', job: 'Job', db: 'DB' }
export const PIN = 18 // half-size of a pin's box (circle r17 + stroke)
export const CHIP_H = 24
export const LABEL_H = 18
// Outfit 500 11.5px is ~5.9px per char; 31px of dot and padding. The widest status text ('deploying') is reserved, so a status change never moves the chip.
export const chipW = (type: string, host: string) => Math.ceil(31 + 5.9 * ((WORD[type] ?? type).length + 1 + Math.max(host.length, 9)))
export const pinBox = (p: Pt): Box => [p[0] - PIN, p[1] - PIN, p[0] + PIN, p[1] + PIN]

// Right of the pin first (like the design), then left, above, diagonals, below.
export function chipCands([x, y]: Pt, w: number): Chip[] {
  const h = CHIP_H, up = y - PIN - 2 - h, dn = y + PIN + 2
  return [
    { box: [x + 19, y - h / 2, x + 19 + w, y + h / 2], align: 'start' },
    { box: [x - 19 - w, y - h / 2, x - 19, y + h / 2], align: 'end' },
    { box: [x - w / 2, up, x + w / 2, up + h], align: 'center' },
    { box: [x + 8, up, x + 8 + w, up + h], align: 'start' },
    { box: [x - 8 - w, up, x - 8, up + h], align: 'end' },
    { box: [x - w / 2, dn, x + w / 2, dn + h], align: 'center' },
    { box: [x + 8, dn, x + 8 + w, dn + h], align: 'start' },
    { box: [x - 8 - w, dn, x - 8, dn + h], align: 'end' },
  ]
}

export const pinDy = (h: number) => h / 2 + 12 // pin centre above the building centre: just over the roof

// On the curve itself at t in [0.3, 0.7] first (centre out); the box covers the text's run along the path.
const TS = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8]
export function labelCands(path: Pt[], w: number): { box: Box; frac: number; n: Pt }[] {
  const cum = path.reduce<number[]>((a, p, i) => (a.push(i ? a[i - 1] + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), a), [])
  const L = cum[cum.length - 1] || 1
  return TS.map((t) => {
    const run = path.filter((_, i) => Math.abs(cum[i] - t * L) <= w / 2 + 4)
    const i = cum.findIndex((c) => c >= t * L), a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const xs = run.map((p) => p[0]), ys = run.map((p) => p[1])
    return { box: [Math.min(...xs) - 4, Math.min(...ys) - LABEL_H / 2, Math.max(...xs) + 4, Math.max(...ys) + LABEL_H / 2] as Box, frac: t, n: [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] as Pt }
  })
}

// First candidate clear of every hard obstacle (2px gap) that also passes `soft`; else the first hard-clear one; `ok` is false when none is.
export function firstFree<T>(cands: T[], boxOf: (c: T) => Box, hard: Pt[][], soft: (b: Box) => boolean): { c: T; ok: boolean } {
  const clear = (c: T) => { const p = boxPoly(grow(boxOf(c), 2)); return !hard.some((o) => polysHit(p, o)) }
  const good = cands.filter(clear)
  return { c: good.find((c) => soft(boxOf(c))) ?? good[0] ?? cands[0], ok: good.length > 0 }
}

export const onPath = (b: Box, path: Pt[]) => path.some(([x, y]) => x > b[0] && x < b[2] && y > b[1] && y < b[3])
// Inside the plot outline, give or take the chip hanging a little over the edge like in the design.
export const inPlot = (poly: Pt[], b: Box) => boxPoly(b).every(([x, y]) => inside(poly, x, y) || distPoly(poly, x, y) < 24)
