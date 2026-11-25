import { makeBuilding } from './buildings'
import { bboxOf, bezier, boxPoly, distPath, distPoly, f1, grow, inside, rectPoly, rot, smooth, union } from './geom'
import { chipCands, chipW, firstFree, inPlot, labelCands, onPath, pinBox, pinDy, type Chip } from './labels'
import { hash, pick, range, ring, rngFor } from './rng'
import { textW } from './smear'
import type { Box, ConfigEstate, ConfigNode, Estate, Patch, Pt, Road } from './types'

const BASES = ['#A9B887', '#A3B585', '#A6B889', '#AAB684']
const PATCH = ['#C9C68E', '#86A585', '#B9B27E', '#9DB27F', '#B4BF8E', '#C7C48C', '#82A287', '#BCAE7C', '#98AE7E']
const RANK: Record<string, number> = { cms: 0, repo: 1, job: 1, db: 2, site: 3 }
const BIOMES = ['orchard', 'meadow', 'pond', 'vineyard'] as const
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

// Nodes grouped by data-flow depth (longest path from a source); inside a column studio -> repo -> site.
function layers(e: ConfigEstate): ConfigNode[][] {
  const depth = new Map(e.nodes.map((n) => [n.id, 0]))
  for (let i = 0; i < e.nodes.length; i++) for (const ed of e.edges) depth.set(ed.to, Math.min(e.nodes.length - 1, Math.max(depth.get(ed.to) ?? 0, (depth.get(ed.from) ?? 0) + 1)))
  const cols: ConfigNode[][] = []
  for (const n of [...e.nodes].sort((x, y) => (RANK[x.type] ?? 2) - (RANK[y.type] ?? 2))) (cols[depth.get(n.id)!] ??= []).push(n)
  return cols.filter(Boolean)
}

// All randomness is drawn from per-estate streams and only the final coordinates are offset by (ox, oy),
// so an estate has the same shape wherever the layout puts it.
export function genEstate(seed: string, ce: ConfigEstate, ox: number, oy: number, hoodAngle: number): Estate {
  const R = (p: string) => rngFor(seed, ce.id, p)
  const shape = R('shape')
  const tilt = range(shape, -0.5, 0.1)
  const wave = ring(shape, 5), wave2 = ring(shape, 11)
  const N = 14
  const jit = Array.from({ length: N }, () => range(shape, -0.015, 0.015))
  const outline = (a: number, b: number): Pt[] => Array.from({ length: N }, (_, i) => {
    const t = i / N
    const k = 1 + 0.5 * (wave(t) - 0.5) + 0.2 * (wave2(t) - 0.5)
    const th = (t + jit[i]) * 2 * Math.PI
    return [a * k * Math.cos(th), b * k * Math.sin(th)]
  })
  // F: plot frame -> world minus the plot's offset. Pins, chips and labels are screen-aligned, so they are placed in this frame.
  const F = (p: Pt): Pt => rot(p, tilt, [0, 0])
  const W = (p: Pt): Pt => { const q = F(p); return [q[0] + ox, q[1] + oy] }
  const off = (b: Box): Box => [f1(b[0] + ox), f1(b[1] + oy), f1(b[2] + ox), f1(b[3] + oy)]

  const br = R('buildings')
  const B = new Map(ce.nodes.map((n) => [n.id, makeBuilding(br, n.id, n.type, hoodAngle)]))
  const CW = new Map(ce.nodes.map((n) => [n.id, chipW(n.type, String(n.host ?? ''))]))
  const cols = layers(ce)
  const deg = (id: string) => ce.edges.filter((e) => e.from === id || e.to === id).length
  const nodeBoxes = (id: string, [x, y]: Pt): Box[] => { const { w, h } = B.get(id)!; return [[x - w / 2, y - h / 2, x + w / 2, y + h / 2], pinBox([x, y - pinDy(h)])] }

  // Columns by depth along u, siblings spread across v (zig-zag for single nodes, like the design). Spacing holds
  // each building, its pin above and its chip to the right; g stretches it when chips or labels do not fit.
  // Long flows snake into `rows` rows (even rows run left to right, odd rows back) so the plot stays compact.
  const place = (g: number, rows: number): Map<string, Pt> => {
    const pos = new Map<string, Pt>(), jr = R('jitter')
    const per = Math.ceil(cols.length / rows)
    let rowTop = 0, w0 = 0
    for (let r = 0; r * per < cols.length; r++) {
      const rowPos = new Map<string, Pt>()
      let u = 0, prevR = 0
      cols.slice(r * per, (r + 1) * per).forEach((col, ci) => {
        const L = Math.max(...col.map((n) => Math.max(B.get(n.id)!.w / 2, 24)))
        const Rt = Math.max(...col.map((n) => Math.max(B.get(n.id)!.w / 2, 20 + CW.get(n.id)!)))
        if (ci) u += (prevR + L + 8) * g
        prevR = Rt
        const par = (id: string) => ce.edges.filter((e) => e.to === id && rowPos.has(e.from)).map((e) => rowPos.get(e.from)![1])
        const bary = (id: string) => (par(id).length ? mean(par(id)) : 0)
        const sorted = [...col].sort((x, y) => bary(x.id) - bary(y.id)) // order by parents, so fan-ins do not cross
        const pitch = (Math.max(...col.map((n) => B.get(n.id)!.h)) + 80) * g
        const shift = ci ? mean(sorted.map((n) => bary(n.id))) : 0
        sorted.forEach((n, i) => {
          const ps = par(n.id)
          const v = col.length > 1 ? (i - (col.length - 1) / 2) * pitch + shift : ps.length > 1 ? mean(ps) : (ci % 2 ? 1 : -1) * 70 * g
          rowPos.set(n.id, [u + range(jr, -6, 6), v + range(jr, -6, 6)])
        })
      })
      if (!r) w0 = u
      const bx = union([...rowPos].flatMap(([id, p]) => nodeBoxes(id, p)))
      for (const [id, p] of rowPos) pos.set(id, [r % 2 ? w0 - p[0] : p[0], p[1] + rowTop - bx[1]])
      rowTop += bx[3] - bx[1] + 70 * g
    }
    return pos
  }
  // fewest rows whose layout is not too long and thin
  const aspectOf = (pos: Map<string, Pt>) => { const bx = union([...pos].flatMap(([id, p]) => nodeBoxes(id, p))); const a = (bx[2] - bx[0]) / (bx[3] - bx[1]); return Math.max(a, 1 / a) }
  const asps = [1, 2, 3].filter((r) => r <= cols.length).map((r) => aspectOf(place(1, r)))
  const nRows = (asps.findIndex((x) => x <= 2.4) + 1) || asps.indexOf(Math.min(...asps)) + 1

  const fit = (g: number) => {
    const pos = place(g, nRows)
    const bx = pos.size ? union([...pos].flatMap(([id, p]) => nodeBoxes(id, p))) : [-30, -30, 30, 30] // no nodes: a small empty plot, not an infinite box
    const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2
    for (const p of pos.values()) { p[0] -= cx; p[1] -= cy }
    // plot blob from the layout bounds plus margin; grows until every building and pin sits inside the outline,
    // and stays roundish (bounding box aspect <= 1.4) by growing its short side
    let A = (bx[2] - bx[0]) / 2 + 24, Bb = (bx[3] - bx[1]) / 2 + 24, lpts: Pt[] = [], polyF: Pt[] = []
    for (let k = 0; k < 120; k++) {
      lpts = outline(A, Bb)
      polyF = smooth(lpts).poly.map(F)
      const pb = bboxOf(polyF), asp = (pb[2] - pb[0]) / (pb[3] - pb[1])
      if (asp > 1.4) Bb *= 1.02
      else if (asp < 1 / 1.4) A *= 1.02
      else if (![...pos].every(([id, p]) => nodeBoxes(id, F(p)).every((bb) => boxPoly(bb).every(([x, y]) => inside(polyF, x, y) && distPoly(polyF, x, y) > 4)))) { A *= 1.02; Bb *= 1.02 }
      else break
    }
    const placed = ce.nodes.map((n) => ({ b: B.get(n.id)!, lx: pos.get(n.id)![0], ly: pos.get(n.id)![1] }))
    const byId = new Map(placed.map((p) => [p.b.id, p]))

    // Roads: one seeded curve per edge, trimmed at the building footprints; shared endpoints bend less so fan-ins stay clean.
    const rr_ = R('roads')
    const rds = ce.edges.flatMap((ed) => {
      const A = byId.get(ed.from), Bn = byId.get(ed.to)
      if (!A || !Bn) return []
      const dx = Bn.lx - A.lx, dy = Bn.ly - A.ly, len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      const sa = Math.hypot(A.b.w, A.b.h) * 0.42, sb = Math.hypot(Bn.b.w, Bn.b.h) * 0.42
      const p0: Pt = [A.lx + ux * sa, A.ly + uy * sa], p3: Pt = [Bn.lx - ux * sb, Bn.ly - uy * sb]
      const l2 = len - sa - sb, bow = deg(ed.from) > 1 || deg(ed.to) > 1 ? 0.08 : 0.22
      const k1 = range(rr_, -bow, bow) * l2, k2 = range(rr_, -bow, bow) * l2
      const c1: Pt = [p0[0] + ux * l2 * 0.33 - uy * k1, p0[1] + uy * l2 * 0.33 + ux * k1]
      const c2: Pt = [p0[0] + ux * l2 * 0.66 - uy * k2, p0[1] + uy * l2 * 0.66 + ux * k2]
      return [{ ed, w: [p0, c1, c2, p3], lp: bezier(p0, c1, c2, p3, 32) }]
    })

    // Chips, then path labels: first free spot that clears pins, buildings and what is placed already.
    const pinsF = placed.map((p) => { const c = F([p.lx, p.ly]); return [c[0], c[1] - pinDy(p.b.h)] as Pt })
    const hard: Pt[][] = [...pinsF.map((p) => boxPoly(pinBox(p))), ...placed.map((p) => { const c = F([p.lx, p.ly]); return rectPoly(c[0], c[1], p.b.w, p.b.h, p.b.rot) })]
    const paths = rds.map((r) => r.lp.map(F))
    const softFor = (pad: number) => (bb: Box) => inPlot(polyF, bb) && !paths.some((pa) => onPath(grow(bb, pad), pa))
    let ok = true
    const chips: Record<string, Chip> = {}
    placed.forEach((p, i) => {
      const r = firstFree(chipCands(pinsF[i], CW.get(p.b.id)!), (c) => c.box, hard, softFor(4))
      ok &&= r.ok; chips[p.b.id] = r.c; hard.push(boxPoly(r.c.box))
    })
    const labels = rds.map((r, i) => {
      const text = (r.ed.label ?? r.ed.type).toUpperCase()
      const q = firstFree(labelCands(paths[i], textW(text, true) * 1.4), (c) => c.box, hard, (bb) => inPlot(polyF, bb) && !paths.some((pa, j) => j !== i && onPath(grow(bb, 3), pa)))
      ok &&= q.ok; hard.push(boxPoly(q.c.box))
      return { text, ...q.c }
    })
    return { ok, lpts, placed, rds, chips, labels }
  }
  let f = fit(1)
  for (let g = 1.07; !f.ok && g < 2.6; g *= 1.07) f = fit(g)
  const { lpts, placed, rds, chips, labels } = f
  const a = Math.max(...lpts.map((p) => Math.abs(p[0]))), b = Math.max(...lpts.map((p) => Math.abs(p[1])))
  const area = Math.PI * a * b
  const lpolyW = smooth(lpts).poly // placement tests run in the unrotated frame
  const wpoly = lpolyW.map(W)
  const wd = smooth(lpts.map(W)).d
  const rad = Math.max(...lpolyW.map((p) => Math.hypot(p[0], p[1])))
  for (const p of placed) { const [wx, wy] = W([p.lx, p.ly]); p.b.x = f1(wx); p.b.y = f1(wy) }
  const buildings = placed.map((p) => p.b)
  const roadPts = rds.map((r) => r.lp)
  const roads: Road[] = rds.map((r, i) => {
    const [w0, w1, w2, w3] = r.w.map(W), lb = labels[i]
    const cubic = (q: Pt[]) => `M${f1(q[0][0])} ${f1(q[0][1])} C${f1(q[1][0])} ${f1(q[1][1])} ${f1(q[2][0])} ${f1(q[2][1])} ${f1(q[3][0])} ${f1(q[3][1])}`
    const flip = w3[0] < w0[0] // text on a right-to-left road runs along the reversed curve, so it stays upright
    const ln = r.lp.map(F), m = ln[Math.round(lb.frac * (ln.length - 1))]
    return {
      id: `${r.ed.from}>${r.ed.to}`, from: r.ed.from, to: r.ed.to, d: cubic([w0, w1, w2, w3]),
      pts: r.lp.map(W), label: lb.text, labelBox: off(lb.box), labelPath: cubic(flip ? [w3, w2, w1, w0] : [w0, w1, w2, w3]), labelAt: flip ? 1 - lb.frac : lb.frac,
      lamp: [f1(m[0] + lb.n[0] * 14 + ox), f1(m[1] + lb.n[1] * 14 + oy)],
    }
  })

  // Land colours (same layers are drawn grey around the plot and in colour inside it).
  const lr = R('land')
  const base = pick(lr, BASES)
  const randIn = (r: () => number, margin: number): Pt => {
    for (let t = 0; t < 80; t++) {
      const p: Pt = [range(r, -a, a), range(r, -b, b)]
      if (inside(lpolyW, p[0], p[1]) && distPoly(lpolyW, p[0], p[1]) > margin) return p
    }
    return [0, 0]
  }
  const patches: Patch[] = []
  for (let i = 0; i < 6; i++) {
    const th = range(lr, 0, 2 * Math.PI), k = range(lr, 0.35, 0.8), q = W([Math.cos(th) * a * k, Math.sin(th) * b * k])
    patches.push({ x: f1(q[0]), y: f1(q[1]), r: Math.round(range(lr, 65, 105)), fill: pick(lr, PATCH), o: f1(range(lr, 0.6, 0.9)) })
  }
  // spill over the border so the colour fades into the grey land outside
  for (let i = 0; i < 3; i++) {
    const th = range(lr, 0, 2 * Math.PI), q = W([Math.cos(th) * a * 1.05, Math.sin(th) * b * 1.05])
    patches.push({ x: f1(q[0]), y: f1(q[1]), r: Math.round(range(lr, 45, 70)), fill: pick(lr, PATCH), o: 0.6 })
  }

  // Garden: biome weights the scatter of trees, beds, ponds and rows.
  const gr = R('garden')
  const biome = pick(gr, BIOMES)
  // keeps chips and path labels free of ponds and trees
  const hang = [...Object.values(chips).map((c) => c.box), ...labels.map((l) => l.box)].map((bb) => grow(bb, 10))
  const chipFree = (x: number, y: number) => { const [fx, fy] = F([x, y]); return hang.every((bb) => !(fx > bb[0] && fx < bb[2] && fy > bb[1] && fy < bb[3])) }
  const free = (x: number, y: number, m: number) =>
    chipFree(x, y) && distPoly(lpolyW, x, y) > 16 && placed.every((p) => Math.hypot(x - p.lx, y - p.ly) > Math.hypot(p.b.w, p.b.h) / 2 + m) && roadPts.every((rp) => distPath(rp.map((q) => [q[0], q[1]] as Pt), x, y) > 18)
  const ponds: Estate['ponds'] = []
  const taken: Pt[] = []
  const scatter = (count: number, min: number, margin: number): Pt[] => {
    const out: Pt[] = []
    for (let t = 0; t < count * 30 && out.length < count; t++) {
      const [x, y] = [range(gr, -a, a), range(gr, -b, b)]
      if (inside(lpolyW, x, y) && free(x, y, margin) && [...taken, ...out].every((q) => Math.hypot(x - q[0], y - q[1]) > min)) out.push([x, y])
    }
    taken.push(...out)
    return out
  }
  if (biome === 'pond') {
    const [p] = scatter(1, 70, 60)
    if (p) { const q = W(p); ponds.push({ x: f1(q[0]), y: f1(q[1]), rx: Math.round(range(gr, 26, 36)), ry: Math.round(range(gr, 15, 22)) }) }
  }
  const scale = area / 97000
  const nTrees = Math.round((biome === 'orchard' ? 14 : biome === 'meadow' ? 6 : 8) * scale)
  const trees = scatter(nTrees, biome === 'orchard' ? 34 : 40, 30).map((p) => { const q = W(p); return { x: f1(q[0]), y: f1(q[1]), s: Math.round(range(gr, 26, 36)) } })
  const beds = scatter(Math.round((biome === 'meadow' ? 7 : 3) * scale), 44, 34).map((p): Box => { const q = W(p); return [f1(q[0]), f1(q[1]), 28, 16] })
  const rows: string[] = []
  if (biome === 'vineyard') {
    const [c] = scatter(1, 0, 50)
    if (c) for (let i = 0; i < 6; i++) { const p = W([c[0] - 40, c[1] - 24 + i * 9]), q = W([c[0] + 40, c[1] - 24 + i * 9]); rows.push(`M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}`) }
  }

  const dr = R('drops')
  const drops: Estate['drops'] = Array.from({ length: 9 }, () => {
    const th = range(dr, 0, 2 * Math.PI), k = range(dr, 1.02, 1.1)
    const q = W([Math.cos(th) * a * k, Math.sin(th) * b * k])
    return { x: f1(q[0]), y: f1(q[1]), r: f1(range(dr, 1.4, 4.5)), c: pick(dr, [base, ...patches.map((p) => p.fill)]) }
  })

  // Campfire: the freest spot away from buildings and paths.
  const cr = R('fire')
  let fire: Pt = [0, 0], fs = -1
  for (let t = 0; t < 60; t++) {
    const p = randIn(cr, 30)
    const s = Math.min(...placed.map((q) => Math.hypot(p[0] - q.lx, p[1] - q.ly)), ...roadPts.map((rp) => distPath(rp, p[0], p[1]) * 2.5))
    if (s > fs) { fs = s; fire = p }
  }

  // Estate name: top-left or bottom-right of the outline, like the design's two labels.
  const text = ce.label.toUpperCase()
  const tw = textW(text)
  const tl = R('tag')() < 0.5
  const ext = wpoly.reduce((m, p) => ((tl ? -p[0] - p[1] : p[0] + p[1]) > (tl ? -m[0] - m[1] : m[0] + m[1]) ? p : m), wpoly[0])
  const tx = tl ? ext[0] - 47 : ext[0] - tw * 0.76
  const ty = tl ? ext[1] - 39 : ext[1] + 58
  const tag = { text, x: f1(tx), y: f1(ty), w: f1(tw), h: 15 }

  const chipsW = Object.fromEntries(Object.entries(chips).map(([id, c]) => [id, { box: off(c.box), align: c.align }]))
  const pins = Object.fromEntries(buildings.map((bl) => [bl.id, [bl.x, f1(bl.y - pinDy(bl.h))] as Pt]))
  const bb = union([bboxOf(wpoly), [tag.x, tag.y - 14, tag.x + tw, tag.y + 4], ...roads.map((r) => bboxOf(r.pts)), ...roads.map((r) => r.labelBox), ...Object.values(chipsW).map((c) => c.box)]).map((v, i) => f1(v + (i < 2 ? -70 : 70))) as Box
  const fw = W(fire)
  return {
    id: ce.id, label: ce.label, cx: ox, cy: oy, r: Math.round(rad), bb,
    d: wd, poly: wpoly.map((p) => [f1(p[0]), f1(p[1])] as Pt),
    base, patches, trees, beds, ponds, rows, drops,
    seeds: [1 + (hash(seed, ce.id, 'aq1') % 90), 1 + (hash(seed, ce.id, 'aq2') % 90), 1 + (hash(seed, ce.id, 'aq3') % 90), 1 + (hash(seed, ce.id, 'aq4') % 90)],
    buildings, roads, tag, pins, chips: chipsW, campfire: [f1(fw[0]), f1(fw[1])],
  }
}
