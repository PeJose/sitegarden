import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { makeEstate, syntheticEstates } from '../../server/mock'
import { bboxOf, boxPoly, distPoly, polysHit, rectPoly } from './geom'
import { pinBox } from './labels'
import { rngFor } from './rng'
import { generateWorld } from './world'
import type { Config, ConfigEstate, Pt, World } from './types'

process.env.SITEGARDEN_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-gen-')) // before store.ts loads
const { bootstrap, loadConfig } = await import('../../server/config')
bootstrap()
const full = await loadConfig()
const cfg: Config = { ...full, estates: full.estates.slice(0, 2) } // the two original estates; the planted ones are not part of the test base

test('same seed and config give an identical World', () => {
  assert.deepEqual(generateWorld(cfg), generateWorld(cfg))
})

test('a different account seed gives a different map', () => {
  assert.notDeepEqual(generateWorld(cfg).estates[0].d, generateWorld({ ...cfg, accountSeed: 'other' }).estates[0].d)
})

test('adding an estate leaves the existing estates identical (shape, buildings, roads, positions)', () => {
  const a = generateWorld(cfg)
  const extra = makeEstate(rngFor('t', 1), cfg.estates.map((e) => e.id))
  const b = generateWorld({ ...cfg, estates: [...cfg.estates, extra] }, a.positions)
  cfg.estates.forEach((_, i) => assert.deepEqual(b.estates[i], a.estates[i]))
  assert.equal(b.estates.length, 3)
})

test('removing the last estate restores the previous world exactly (no jumps)', () => {
  const a = generateWorld(cfg)
  const extra = makeEstate(rngFor('t', 2), cfg.estates.map((e) => e.id))
  const b = generateWorld({ ...cfg, estates: [...cfg.estates, extra] }, a.positions)
  const c = generateWorld(cfg, b.positions)
  assert.deepEqual(c.estates, a.estates)
})

test('planted estates do not overlap earlier ones', () => {
  let w = generateWorld(cfg)
  const ests = [...cfg.estates]
  for (let i = 0; i < 6; i++) {
    ests.push(makeEstate(rngFor('t', 10 + i), ests.map((e) => e.id)))
    w = generateWorld({ ...cfg, estates: ests }, w.positions)
  }
  for (const a of w.estates) for (const b of w.estates) {
    if (a === b) continue
    const d = Math.min(...a.poly.flatMap((p) => b.poly.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))))
    assert.ok(d > 40, `${a.id} vs ${b.id}: ${d}`)
  }
})

const notes: ConfigEstate = {
  id: 'notes', label: 'notes',
  nodes: [['cms', 'Sanity'], ['repo', 'GitHub'], ['db', 'Postgres'], ['job', 'cron'], ['site', 'Vercel']].map(([type, host]) => ({ id: `notes-${type}`, type, name: type, host })),
  edges: [['cms', 'repo', 'WEBHOOK'], ['repo', 'site', 'VERCEL'], ['db', 'site', 'SQL'], ['job', 'db', 'CRON']].map(([f, t, label]) => ({ from: `notes-${f}`, to: `notes-${t}`, type: 'deploy', label })),
}

// Every chip, pin and path label of the world must be free of every other one and of every building.
function overlaps(w: World): string[] {
  const items: { n: string; p: Pt[] }[] = []
  for (const e of w.estates) {
    for (const [id, p] of Object.entries(e.pins)) items.push({ n: `pin ${id}`, p: boxPoly(pinBox(p)) }, { n: `chip ${id}`, p: boxPoly(e.chips[id].box) })
    for (const r of e.roads) items.push({ n: `label ${r.id}`, p: boxPoly(r.labelBox) })
    for (const b of e.buildings) items.push({ n: `building ${b.id}`, p: rectPoly(b.x, b.y, b.w, b.h, b.rot) })
  }
  const bad: string[] = []
  items.forEach((a, i) => items.slice(i + 1).forEach((b) => {
    if (a.n.startsWith('building') && b.n.startsWith('building')) return
    if (a.n.startsWith('pin') && b.n.startsWith('building')) return // a pin sits on its building's roof edge by design
    if (b.n.startsWith('pin') && a.n.startsWith('building')) return
    if (polysHit(a.p, b.p)) bad.push(`${a.n} x ${b.n}`)
  }))
  return bad
}

test('no chip, pin or path label overlaps another or a building: base, base + notes, 8 estates', () => {
  const eight = { ...cfg, estates: [...cfg.estates, ...syntheticEstates(cfg.estates.map((e) => e.id), 6)] }
  for (const c of [cfg, { ...cfg, estates: [...cfg.estates, notes] }, eight]) assert.deepEqual(overlaps(generateWorld(c)), [])
})

test('chips keep their reserved size and stay on the map', () => {
  const w = generateWorld({ ...cfg, estates: [...cfg.estates, notes] })
  for (const e of w.estates) for (const c of Object.values(e.chips)) assert.ok(c.box[2] - c.box[0] > 90 && c.box[0] >= e.bb[0] && c.box[2] <= e.bb[2])
})

test('a saved position that now overlaps is moved, the others are kept', () => {
  const a = generateWorld(cfg)
  const [e0, e1] = cfg.estates
  const b = generateWorld(cfg, { [e0.id]: a.positions[e0.id], [e1.id]: a.positions[e0.id] })
  assert.deepEqual(b.positions[e0.id], a.positions[e0.id])
  assert.notDeepEqual(b.positions[e1.id], a.positions[e0.id])
})

test('a hub fans in: the 5-service plot has no crossing roads', () => {
  const e = generateWorld({ ...cfg, estates: [notes] }).estates[0]
  const seg = (a: Pt, b: Pt, c: Pt, d: Pt) => { const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) }
  e.roads.forEach((r, i) => e.roads.slice(i + 1).forEach((q) => {
    if (r.from === q.from || r.to === q.to || r.from === q.to || r.to === q.from) return // roads sharing a building meet there
    assert.ok(!r.pts.some((p, k) => k && q.pts.some((s, j) => j && seg(r.pts[k - 1], p, q.pts[j - 1], s))), `${r.id} crosses ${q.id}`)
  }))
})

test('plots stay roundish (aspect <= 1.45), also for long chains', () => {
  const eight = { ...cfg, estates: [...cfg.estates, notes, ...syntheticEstates(cfg.estates.map((e) => e.id), 6)] }
  for (const e of generateWorld(eight).estates) { const b = bboxOf(e.poly), a = (b[2] - b[0]) / (b[3] - b[1]); assert.ok(a < 1.45 && a > 1 / 1.45, `${e.id}: ${a}`) }
})

test('gates sit on the plot edge and are deterministic', () => {
  const c = { ...cfg, estates: [...cfg.estates, notes, ...syntheticEstates(cfg.estates.map((e) => e.id), 6)] }
  const w = generateWorld(c)
  assert.ok(w.hood.gates.length > 0)
  for (const g of w.hood.gates) assert.ok(distPoly(w.estates.find((e) => e.id === g.estate)!.poly, g.at[0], g.at[1]) < 1.5)
  assert.deepEqual(w.hood.gates, generateWorld(c).hood.gates)
})
