import { buildingSvg } from './buildings'
import { DEFS } from './defs'
import { f1, hit } from './geom'
import { rngFor } from './rng'
import { smearRects } from './smear'
import { wobble } from './wobble'
import type { Box, Estate, Gate, World } from './types'

export type Theme = 'light' | 'night'
const PAPER = { light: '#F6F1E7', night: '#121925' }
export const SMEAR_FILL = { light: '#F8F4EC', night: '#172030' }
const AQ = (DEFS.light.match(/<filter id="aq" [\s\S]*?<\/filter>/) as RegExpMatchArray)[0]

// Per-plot watercolour: the design's `aq` filter with its four noise seeds drawn from the plot's own hash. Split in two so the shape
// (displacement, rim) can run at low resolution while the paper grain and holes stay at full resolution (see estateSoftSvg, estateMaskSvg).
const GRAIN_AT = AQ.indexOf('<feTurbulence type="fractalNoise" baseFrequency="0.75"'), POST_AT = AQ.indexOf('<feComposite in="painted"')
const seeded = (e: Estate, s: string) => s.replace(/seed="(\d+)"/g, (_, v) => `seed="${({ 3: e.seeds[0], 13: e.seeds[1], 12: e.seeds[2], 40: e.seeds[3] } as Record<string, number>)[v]}"`)
const aqShape = (e: Estate) => seeded(e, AQ.slice(0, GRAIN_AT).replace('id="aq"', `id="aq_${e.id}"`) + '<feColorMatrix in="painted" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0"/></filter>')
const aqGrain = (e: Estate) => seeded(e, (AQ.match(/^<filter [^>]*>/) as RegExpMatchArray)[0].replace('id="aq"', `id="aqm_${e.id}"`) + AQ.slice(GRAIN_AT, POST_AT) + '<feComposite in="grain" in2="holes" operator="in"/></filter>')
const rectAt = (v: Box, extra: string) => `<rect x="${v[0]}" y="${v[1]}" width="${v[2] - v[0]}" height="${v[3] - v[1]}" ${extra}/>`
const use = (id: string, x: number, y: number, w: number, h: number) => `<use href="#${id}" x="${f1(x - w / 2)}" y="${f1(y - h / 2)}" width="${w}" height="${h}"/>`
// Why: a filter on an empty group still runs over its whole pinned region, so empty groups are not emitted.
const fg = (attrs: string, inner: string) => (inner ? `<g ${attrs}>${inner}</g>` : '')
const circle = (x: number, y: number, r: number, fill: string, o = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${o < 1 ? ` opacity="${o}"` : ''}/>`

function paper(t: Theme, v: Box): string {
  const f = (id: string, o: number) => rectAt(v, `filter="url(#${id})" opacity="${o}"`)
  return rectAt(v, `fill="${PAPER[t]}"`) + (t === 'light'
    ? f('tone', 0.25) + f('speckBig', 0.5) + f('speckMid', 0.45) + f('speckFine', 0.7) + f('fibreA', 0.5) + f('fibreB', 0.45)
    : f('skyTone', 0.5) + f('starsFine', 0.6) + f('starsBig', 0.9))
}

// The land layer exists twice: grey and faded around the estates (this function with `hood`), and in full colour
// clipped to each plot (see plots). Both use the same patches, so the grey continues seamlessly into the colour.
function halo(es: Estate[]): string {
  return `<g filter="url(#wash)" opacity="0.38">${es.map((e) =>
    `<path d="${e.d}" fill="${e.base}" stroke="${e.base}" stroke-width="44" stroke-linejoin="round"/>` + e.patches.map((p) => circle(p.x, p.y, p.r, p.fill, p.o)).join('')).join('')}</g>`
}

// Thin strokes are wobbled as geometry (see wobble.ts) and carry no filter; the neighbourhood's grey streets are one such group.
const street = (d: string) => { const w = wobble(d); return `<path d="${w}" stroke="#D3C7AE" stroke-width="14"/><path d="${w}" stroke="#F4EEE2" stroke-width="10"/>` }
const hoodSoft = (w: World, v: Box) => {
  const cells = w.hood.cells.filter((c) => hit(c.bb, v, 40))
  return fg('filter="url(#wash)" opacity="0.55"', cells.flatMap((c) => c.patches).map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('')) +
    fg('filter="url(#aqT)"', cells.flatMap((c) => c.trees).map((t) => use('tc', t.x, t.y, t.s, t.s)).join(''))
}
function hoodCrisp(w: World, v: Box, gates: Gate[]): string {
  const cells = w.hood.cells.filter((c) => hit(c.bb, v, 40))
  const [px, py] = w.hood.pivot
  const deg = f1((w.hood.angle * 180) / Math.PI)
  const streets = cells.map((c) => c.streets).join('')
  const stripes = cells.map((c) => c.stripes).join('')
  const houses = cells.flatMap((c) => c.houses).map((h) => `<use href="#${h.k}" x="${h.x}" y="${h.y}" width="${h.k === 'hr' ? 26 : 30}" height="${h.k === 'hr' ? 16 : 18}"/>`).join('')
  const grid = (streets && `<g stroke-linecap="round" stroke-linejoin="round" fill="none">${street(streets)}</g>`) + houses + (stripes ? `<path d="${wobble(stripes)}" stroke="#B9C090" stroke-width="1.2" opacity="0.8" fill="none"/>` : '')
  // the road from the street grid to a gate stays grey until it passes the plot edge
  return (grid ? `<g transform="rotate(${deg} ${px} ${py})">${grid}</g>` : '') + fg('fill="none" stroke-linecap="round" stroke-linejoin="round"', gates.map((g) => street(g.outer)).join(''))
}

// The coloured plots, in two parts: `soft` is the land (its watercolour edge is the costly filter, rendered at low resolution),
// `crisp` is everything drawn over it (splashes, ponds, roads, trees, buildings), at full resolution.
function plots(es: Estate[], t: Theme, gates: Gate[]): { soft: string; crisp: string } {
  const path = (d: string) => `<path d="${d}" stroke="#C9B48E" stroke-width="10"/><path d="${d}" stroke="#EDE0C4" stroke-width="6.5"/>`
  // two small posts either side of the path where it crosses the plot edge
  const posts = (g: Gate) => { const dx = g.at[0] - g.street[0], dy = g.at[1] - g.street[1], l = Math.hypot(dx, dy) || 1; return [1, -1].map((k) => circle(f1(g.at[0] - (dy / l) * 9 * k), f1(g.at[1] + (dx / l) * 9 * k), 2.6, '#7E6B4A')).join('') }
  const road = (e: Estate) => e.roads.map((r) => { const w = wobble(r.d); return `<path d="${w}" stroke="#C9B48E" stroke-width="13"/><path d="${w}" stroke="#EDE0C4" stroke-width="9"/>` }).join('')
  const land = es.map((e) => `<g filter="url(#aq_${e.id})"><g clip-path="url(#c_${e.id})">${rectAt(e.bb, `fill="${e.base}"`)}${e.patches.map((p) => circle(p.x, p.y, p.r, p.fill, p.o)).join('')}</g></g>`).join('')
  // Why: a filter costs per pixel of its region, and the default region of a single element is just its own box; a group's would be the whole plot.
  const one = (id: string, inner: string) => `<g filter="url(#${id}B)">${inner}</g>`
  const drops = es.flatMap((e) => e.drops).map((d) => one('drop', circle(d.x, d.y, d.r, d.c))).join('')
  const ponds = es.flatMap((e) => e.ponds).map((p) => one('aqS', `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" fill="#A5C0C4"/><ellipse cx="${f1(p.x - 6)}" cy="${f1(p.y - 5)}" rx="${f1(p.rx / 2)}" ry="${f1(p.ry / 3)}" fill="#CADCDC"/>`)).join('')
  const roads = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${es.map(road).join('')}${gates.map((g) => path(wobble(g.d))).join('')}<g stroke="#8DA866" stroke-width="2.2" opacity="0.6">${es.flatMap((e) => e.rows).map((d) => `<path d="${wobble(d)}"/>`).join('')}</g></g>`
  const flora = es.flatMap((e) => e.trees.map((tr) => one('aqT', use('tv', tr.x, tr.y, tr.s, tr.s))).concat(e.beds.map(([x, y, w, h]) => one('aqT', use('fb', x, y, w, h))))).join('')
  const blds = gates.map((g) => one('aqS', posts(g))).join('') + es.flatMap((e) => e.buildings.map((b) => one('aqS', buildingSvg(b)))).join('')
  const night = (x: string) => (t === 'night' ? `<g filter="url(#nightFg)">${x}</g>` : x)
  return { soft: night(land), crisp: night(drops + ponds + roads + flora + blds) }
}

// Static night lights (street lamps). Lit windows, campfires and lanterns depend on status and stay live.
const lamp = (x: number, y: number, r: number, dot: number) => circle(x, y, r, 'url(#lampG)') + circle(x, y, dot, '#FFF1C8')

type Parts = { defs: string; body: string }
export const PAD = 64 // rendered around a layer so displacement/blur filters have no seams, then cropped off
const WRAP = ['tone', 'speckBig', 'speckMid', 'speckFine', 'fibreA', 'fibreB', 'skyTone', 'starsFine', 'starsBig']

// Why: librsvg runs a filter over its whole region, which defaults to the group's bbox (a whole plot or street network, far larger than a tile); pinning it to the rendered view cuts that cost.
// Filters whose id ends in B are for single elements and keep their default region (the element's own box).
const pinRegions = (defs: string, v: Box) => defs.replace(/<filter ([^>]*)>/g, (m, a: string) => /id="\w+B"/.test(a) ? m :
  `<filter ${a.replace(/\s(x|y|width|height)="[^"]*"/g, '')} filterUnits="userSpaceOnUse" x="${v[0]}" y="${v[1]}" width="${v[2] - v[0]}" height="${v[3] - v[1]}">`)
const tightDefs = (t: Theme) => ['aqS', 'aqT', 'drop'].map((id) => (DEFS[t].match(new RegExp(`<filter id="${id}" [\\s\\S]*?</filter>`)) as RegExpMatchArray)[0].replace(`id="${id}"`, `id="${id}B"`)).join('')
const doc = (v: Box, scale: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round((v[2] - v[0]) * scale)}" height="${Math.round((v[3] - v[1]) * scale)}" viewBox="${v[0]} ${v[1]} ${v[2] - v[0]} ${v[3] - v[1]}">${inner}</svg>`
const layerDoc = (t: Theme, p: Parts, v: Box, scale: number) => doc(v, scale, `<defs>${pinRegions(DEFS[t] + tightDefs(t) + p.defs, v)}</defs>${p.body}`)

// Texture: paper grain, specks and fibres, position independent. stitchTiles makes the noise repeat seamlessly every `size` units.
export function textureSvg(t: Theme, size: number, scale: number): string {
  const v: Box = [0, 0, size, size]
  const filters = WRAP.flatMap((id) => DEFS[t].match(new RegExp(`<filter id="${id}" [\\s\\S]*?</filter>`)) ?? []).join('').replaceAll('<feTurbulence ', '<feTurbulence stitchTiles="stitch" ')
  return doc(v, scale, `<defs>${filters}</defs>${paper(t, v)}`)
}

// Terrain: the grey neighbourhood, the faded halo around each plot, the smears under estate names. Null when the view is empty paper.
// `soft` (smears, washes, trees: all filtered) is meant for low resolution and needs padding for its filters; `crisp` (streets, houses,
// gate roads, lamps) has no filters, so it is rendered at full resolution over the exact tile. Both are drawn under the same mask and desaturation.
function terrainParts(w: World, t: Theme, v: Box, crisp: boolean): Parts | null {
  const es = w.estates.filter((e) => hit(e.bb, v, 60))
  const fadeEs = w.estates.filter((e) => hit([e.cx - e.r - 560, e.cy - e.r - 560, e.cx + e.r + 560, e.cy + e.r + 560], v))
  const cells = w.hood.cells.filter((c) => hit(c.bb, v, 40))
  if (!es.length && !cells.length) return null
  const region = `maskUnits="userSpaceOnUse" x="${v[0]}" y="${v[1]}" width="${v[2] - v[0]}" height="${v[3] - v[1]}"`
  const defs =
    '<radialGradient id="fadeG"><stop offset="0" stop-color="#fff"/><stop offset="0.4" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    `<mask id="fade" ${region}>${fadeEs.map((e) => circle(e.cx, e.cy, e.r + 560, 'url(#fadeG)')).join('')}</mask>` +
    (crisp ? '' : `<mask id="haloHole" ${region}>${rectAt(v, 'fill="#fff"')}${es.map((e) => `<path d="${e.d}"/>`).join('')}</mask>`)
  const grey = (inner: string) => { const g = `<g mask="url(#fade)" filter="url(#desat)" opacity="0.5">${inner}</g>`; return t === 'night' ? `<g filter="url(#nightBg)">${g}</g>` : g }
  if (crisp) {
    const lamps = t === 'night' ? `<g opacity="0.55">${cells.flatMap((c) => c.lamps).map((p) => lamp(p[0], p[1], 12, 1.5)).join('')}</g>` : ''
    const body = grey(hoodCrisp(w, v, w.hood.gates.filter((g) => es.some((e) => e.id === g.estate)))) + lamps
    return { defs, body }
  }
  const smear = `<g fill="${SMEAR_FILL[t]}"><g filter="url(#smearS)">${es.map((e) => smearRects([[e.tag.x - 10, e.tag.y - 20, e.tag.x + e.tag.w + 10, e.tag.y + 10]], rngFor(w.seed, e.id, 'smear'))).join('')}</g></g>`
  return { defs, body: smear + grey(`<g mask="url(#haloHole)">${halo(es)}</g>${hoodSoft(w, v)}`) }
}
export const terrainSoftSvg = (w: World, t: Theme, v: Box, scale: number) => { const p = terrainParts(w, t, v, false); return p && layerDoc(t, p, v, scale) }
export const terrainCrispSvg = (w: World, t: Theme, v: Box, scale: number) => { const p = terrainParts(w, t, v, true); return p && layerDoc(t, p, v, scale) }

// Estate: one plot's land, ponds, roads, buildings, garden paths and (night) lamps. Its view is the plot plus padding.
// Three renders are composited (see server/apply.ts): `soft` (land, low resolution) multiplied by `grain` (paper grain and holes, full
// resolution), with `crisp` (everything else) on top.
const snap = (n: number, k: number) => Math.floor(n / 8) * 8 + k
export const estateView = (e: Estate): Box => [snap(e.bb[0], -PAD), snap(e.bb[1], -PAD), snap(e.bb[2], 8 + PAD), snap(e.bb[3], 8 + PAD)] // multiples of 8 units, so an eighth-scale render still lands on whole pixels
const gatesOf = (w: World, e: Estate) => w.hood.gates.filter((g) => g.estate === e.id)
export const estateSoftSvg = (w: World, e: Estate, t: Theme, scale: number) =>
  layerDoc(t, { defs: aqShape(e) + `<clipPath id="c_${e.id}"><path d="${e.d}"/></clipPath>`, body: plots([e], t, gatesOf(w, e)).soft }, estateView(e), scale)
export const estateSvg = (w: World, e: Estate, t: Theme, scale: number) =>
  layerDoc(t, { defs: '', body: plots([e], t, gatesOf(w, e)).crisp + (t === 'night' ? e.roads.map((r) => lamp(f1(r.lamp[0]), f1(r.lamp[1]), 16, 2)).join('') : '') }, estateView(e), scale)
export const estateGrainSvg = (e: Estate, scale: number) => { // the same in both themes
  const v = estateView(e)
  return doc(v, scale, `<defs>${pinRegions(aqGrain(e), v)}</defs>${rectAt(v, `fill="#fff" filter="url(#aqm_${e.id})"`)}`)
}

// Live night extras. Fires flicker through CSS classes; stars twinkle. Stars are keyed on a fixed 360-unit lattice,
// so they do not move when the world grows.
export const campfireParts = ([x, y]: [number, number]): { cls: string; box: [number, number, number, number]; svg: string }[] => {
  const g = (inner: string) => `<g transform="translate(${x} ${y})">${inner}</g>`
  // Boxes are the exact geometry boxes of each shape (what `transform-box: fill-box` used), so the flicker keeps its bottom-centre origin.
  return [
    { cls: 'fireglow', box: [x - 38, y - 38, 76, 76], svg: g('<circle r="38" fill="url(#fireG)"/>') },
    { cls: '', box: [x - 7, y + 1, 14, 4], svg: g('<path d="M-7 5 L7 1 M-7 1 L7 5" stroke="#5A3A24" stroke-width="2.4" stroke-linecap="round"/>') },
    { cls: 'flame', box: [x - 3.0455, y - 12, 6.5978, 14.3923], svg: g('<path d="M0 2 C-5 -2 -3 -7 0 -12 C1 -7 5 -5 3 0 C2 2 1 3 0 2 Z" fill="#FFB347"/>') },
    { cls: 'flame', box: [x - 1.1547, y - 7, 2.5689, 8], svg: g('<path d="M0 1 C-2 -2 -1 -5 0 -7 C1 -5 2 -3 1 0 Z" fill="#FFE59A"/>') },
  ]
}
export function twinkleSvg(w: World): [string, string, string] { // one group per twinkle class, so each class is one layer (per-star layers measured no cheaper)
  const S = 360, b = w.bounds
  const out = ['', '', '']
  for (let i = Math.floor(b.x / S); i < Math.ceil((b.x + b.w) / S); i++) for (let j = Math.floor(b.y / S); j < Math.ceil((b.y + b.h) / S); j++) {
    const r = rngFor(w.seed, 'star', i, j)
    if (r() > 0.45) continue
    const x = f1((i + r()) * S), y = f1((j + r()) * S), s = f1(1.4 + r() * 0.5)
    out[Math.floor(r() * 3)] += `<circle cx="${x}" cy="${y}" r="${s}"/><circle cx="${x}" cy="${y}" r="${f1(s * 3.4)}" opacity="0.25"/>`
  }
  return out.map((o) => `<g fill="#FFE7A8">${o}</g>`) as [string, string, string]
}
export { DEFS }
