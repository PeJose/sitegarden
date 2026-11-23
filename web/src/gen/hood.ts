import { bboxOf, distPoly, f1, inside, rot, smooth } from './geom'
import { noise2, pick, range, rngFor, type Rng } from './rng'
import type { Box, Cell, Estate, Gate, Hood, Pt } from './types'

const C = 480 // district size, in the rotated street frame
const WASH = ['#B7C291', '#D8C99E', '#C3C79D', '#CBC79F']
const lineAt = (seed: string, axis: 'h' | 'v', k: number): number | null => {
  const r = rngFor(seed, 'street', axis, k)
  const jitter = r(), keep = r()
  return keep < 0.12 ? null : axis === 'h' ? k * 215 + (jitter - 0.5) * 120 : k * 330 + (jitter - 0.5) * 140
}

// Neighbourhood: a seeded density field decides town / field / wood / empty per district. Streets sit on a global
// rotated lattice, so districts join seamlessly and every cell is a pure function of (seed, cell index).
export function genHood(seed: string, estates: Estate[], area: Box, angle: number): Hood {
  const pivot: Pt = [0, 0] // fixed, so the street lattice never moves when the world grows
  const toW = (p: Pt) => rot(p, angle, pivot)
  const toL = (p: Pt) => rot(p, -angle, pivot)
  const corners = ([[area[0], area[1]], [area[2], area[1]], [area[0], area[3]], [area[2], area[3]]] as Pt[]).map(toL)
  const lb = bboxOf(corners)
  const i0 = Math.floor(lb[0] / C), i1 = Math.ceil(lb[2] / C), j0 = Math.floor(lb[1] / C), j1 = Math.ceil(lb[3] / C)
  const clear = (p: Pt, m: number) => estates.every((e) => Math.hypot(p[0] - e.cx, p[1] - e.cy) > e.r + 80 || (!inside(e.poly, p[0], p[1]) && distPoly(e.poly, p[0], p[1]) > m))
  const cells: Cell[] = []
  const cuts: Pt[] = [] // where a street stops at a plot
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
    const x0 = i * C, y0 = j * C
    const mid = toW([x0 + C / 2, y0 + C / 2])
    const near = Math.min(...estates.map((e) => Math.hypot(mid[0] - e.cx, mid[1] - e.cy) - e.r))
    if (near > 560) continue
    const d = noise2(seed + 'dens', i * 0.6 + 0.3, j * 0.6 + 0.3) + (near < 220 ? 0.18 : 0)
    const kind = d > 0.42 ? 'town' : d > 0.32 ? 'field' : d > 0.22 ? 'wood' : 'empty'
    const r = rngFor(seed, 'cell', i, j)
    const cell = genCell(seed, kind, r, x0, y0, toW, clear, cuts)
    if (cell) cells.push(cell)
  }
  return { angle, pivot, cells, gates: estates.flatMap((e) => gatesFor(seed, e, cuts)) }
}

// One or two entrances per plot: the nearest street end that stopped at the plot gets a gate on the plot edge, and a
// garden path leads from there to the nearest building (or joins an inner road if that is closer).
function gatesFor(seed: string, e: Estate, cuts: Pt[]): Gate[] {
  const r = rngFor(seed, e.id, 'gate')
  const near = cuts.map((c) => ({ c, d: distPoly(e.poly, c[0], c[1]) })).filter((x) => x.d < 260).sort((x, y) => x.d - y.d)
  const picks = near.slice(0, 1).concat(r() < 0.5 ? near.filter((x) => Math.hypot(x.c[0] - near[0].c[0], x.c[1] - near[0].c[1]) > 160).slice(0, 1) : [])
  return picks.map(({ c }) => {
    const g = e.poly.reduce((m, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(m[0] - c[0], m[1] - c[1]) ? p : m))
    const bld = e.buildings.reduce((m, b) => (Math.hypot(b.x - g[0], b.y - g[1]) < Math.hypot(m.x - g[0], m.y - g[1]) ? b : m))
    const dl = Math.hypot(bld.x - g[0], bld.y - g[1]) || 1, sb = Math.hypot(bld.w, bld.h) * 0.42
    let t: Pt = [bld.x + ((g[0] - bld.x) / dl) * sb, bld.y + ((g[1] - bld.y) / dl) * sb]
    const j = e.roads.flatMap((rd) => rd.pts).reduce<Pt>((m, p) => (Math.hypot(p[0] - g[0], p[1] - g[1]) < Math.hypot(m[0] - g[0], m[1] - g[1]) ? p : m), t)
    if (Math.hypot(j[0] - g[0], j[1] - g[1]) < dl - sb) t = j
    const dx = t[0] - g[0], dy = t[1] - g[1], k = (r() < 0.5 ? -1 : 1) * 0.12, n: Pt = [-dy * k, dx * k]
    const p1 = [g[0] + dx / 3 + n[0], g[1] + dy / 3 + n[1]], p2 = [g[0] + (dx * 2) / 3 - n[0], g[1] + (dy * 2) / 3 - n[1]]
    return { estate: e.id, at: [f1(g[0]), f1(g[1])], street: [f1(c[0]), f1(c[1])], outer: `M${f1(c[0])} ${f1(c[1])} L${f1(g[0])} ${f1(g[1])}`, d: `M${f1(g[0])} ${f1(g[1])} C${f1(p1[0])} ${f1(p1[1])} ${f1(p2[0])} ${f1(p2[1])} ${f1(t[0])} ${f1(t[1])}` }
  })
}


function genCell(seed: string, kind: string, r: Rng, x0: number, y0: number, toW: (p: Pt) => Pt, clear: (p: Pt, m: number) => boolean, cuts: Pt[]): Cell | null {
  const x1 = x0 + C, y1 = y0 + C
  const cell: Cell = { bb: [0, 0, 0, 0], streets: '', houses: [], stripes: '', lamps: [], trees: [], patches: [] }
  const hs: number[] = [], vs: number[] = []
  if (kind === 'town') {
    for (let k = Math.floor(y0 / 215) - 1; k <= Math.ceil(y1 / 215) + 1; k++) { const y = lineAt(seed, 'h', k); if (y !== null && y >= y0 && y < y1) hs.push(y) }
    for (let k = Math.floor(x0 / 330) - 1; k <= Math.ceil(x1 / 330) + 1; k++) { const x = lineAt(seed, 'v', k); if (x !== null && x >= x0 && x < x1) vs.push(x) }
  }
  // A street runs only where it is clear of plots; the ends that stop at a plot are recorded for the gates.
  const stretch = (a: number, b: number, at: (t: number) => Pt, d: (a: number, b: number) => string) => {
    let from: number | null = null
    for (let t = a; t <= b + 6; t += 6) {
      const ok = t <= b && clear(toW(at(t)), 18)
      if (ok && from === null) { from = t; if (t > a) cuts.push(toW(at(t))) }
      if (!ok && from !== null) { cell.streets += d(from, t - 6); if (t <= b) cuts.push(toW(at(t - 6))); from = null }
    }
  }
  for (const y of hs) {
    stretch(x0 - 12, x1 + 12, (x) => [x, y], (a, b) => `M${f1(a)} ${f1(y)}H${f1(b)}`)
    for (let x = x0 + 10; x < x1 - 40; x += 40) {
      if (r() > 0.4) continue
      const n = 2 + Math.floor(r() * 2), above = r() < 0.5
      for (let m = 0; m < n; m++) {
        const hx = x + m * 35, hy = above ? y - 42 : y + 16
        if (clear(toW([hx + 13, hy + 8]), 40)) cell.houses.push({ x: f1(hx), y: f1(hy), k: r() < 0.65 ? 'hr' : 'hg' })
      }
      x += n * 35
    }
  }
  for (const x of vs) {
    stretch(y0 - 12, y1 + 12, (y) => [x, y], (a, b) => `M${f1(x)} ${f1(a)}V${f1(b)}`)
    for (let y = y0 + 20; y < y1 - 70; y += 40) {
      if (r() > 0.3) continue
      const left = r() < 0.5
      for (let m = 0; m < 3; m++) if (clear(toW([x + (left ? -30 : 16) + 13, y + m * 30 + 8]), 40)) cell.houses.push({ x: f1(x + (left ? -44 : 16)), y: f1(y + m * 30), k: r() < 0.65 ? 'hr' : 'hg' })
    }
  }
  if (kind === 'town') for (const x of vs) for (const y of hs) if (r() < 0.4) cell.lamps.push(toW([x + 14, y - 14]).map(f1) as Pt)
  if (kind === 'field') {
    const w = range(r, 120, 190), h = range(r, 70, 100), fx = x0 + range(r, 20, C - w - 20), fy = y0 + range(r, 20, C - h - 20)
    if (clear(toW([fx + w / 2, fy + h / 2]), 90)) for (let y = fy; y < fy + h; y += 10) cell.stripes += `M${f1(fx)} ${f1(y)}H${f1(fx + w)}`
  }
  const nt = kind === 'wood' ? 6 + Math.floor(r() * 7) : kind === 'empty' ? Math.floor(r() * 3) : Math.floor(r() * 3)
  const cx = kind === 'wood' ? x0 + range(r, 100, C - 100) : 0, cy = kind === 'wood' ? y0 + range(r, 100, C - 100) : 0
  for (let t = 0; t < nt * 4 && cell.trees.length < nt; t++) {
    const p: Pt = kind === 'wood' ? [cx + range(r, -110, 110), cy + range(r, -90, 90)] : [x0 + r() * C, y0 + r() * C]
    const q = toW(p)
    if (clear(q, 40) && cell.trees.every((o) => Math.hypot(o.x - q[0], o.y - q[1]) > 32)) cell.trees.push({ x: f1(q[0]), y: f1(q[1]), s: Math.round(range(r, 26, 40)) })
  }
  if (kind !== 'empty' && r() < 0.55) {
    const c = toW([x0 + range(r, 60, C - 60), y0 + range(r, 60, C - 60)]), rad = range(r, 55, 105)
    if (clear(c, rad * 0.6)) {
      const pts: Pt[] = Array.from({ length: 7 }, (_, i) => { const th = (i / 7) * 2 * Math.PI, k = range(r, 0.75, 1.15); return [c[0] + Math.cos(th) * rad * k, c[1] + Math.sin(th) * rad * k * 0.8] })
      cell.patches.push({ d: smooth(pts).d, fill: pick(r, WASH) })
    }
  }
  if (!cell.streets && !cell.houses.length && !cell.stripes && !cell.trees.length && !cell.patches.length) return null
  cell.bb = bboxOf([[x0 - 30, y0 - 30], [x1 + 30, y0 - 30], [x0 - 30, y1 + 30], [x1 + 30, y1 + 30]].map((p) => toW(p as Pt)))
  return cell
}
