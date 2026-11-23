import { f1 } from './geom'
import { pick, range, type Rng } from './rng'
import type { Box, Building } from './types'

// type -> family of variants (VISUAL.md). Palettes are [wall/roof, ridge line, ribs], muted watercolour tones from the design.
type Spec = { n: number; w: [number, number]; h: [number, number]; pals: [string, string, string][] }
const SPECS: Record<string, Spec> = {
  cms: { n: 3, w: [50, 64], h: [30, 38], pals: [['#C2D6CC', '#7A9B8F', '#93B2A6'], ['#CADBD0', '#86A596', '#9DBBAD'], ['#BDD3D6', '#7898A0', '#93B1B8']] },
  repo: { n: 3, w: [66, 84], h: [38, 46], pals: [['#B3B6B8', '#878B8F', '#A0A4A7'], ['#BBB4AA', '#8E877C', '#A59E94'], ['#B9806A', '#8A5440', '#A66E58']] },
  site: { n: 3, w: [40, 50], h: [26, 32], pals: [['#CB9373', '#A06A4F', '#E3D6BF'], ['#B98068', '#8A5440', '#DCCFB8'], ['#C79B6E', '#9A7048', '#E6DAC4']] },
  db: { n: 2, w: [24, 28], h: [24, 28], pals: [['#BFBAB0', '#8F8A80', '#A9A399'], ['#B7B2A6', '#8A857A', '#A29D91']] },
  job: { n: 2, w: [34, 40], h: [24, 28], pals: [['#C9B79A', '#9B8764', '#B8A584'], ['#D0BFA3', '#A08C69', '#BFAE8E']] },
}
const SHED = { n: 1, w: [22, 26] as [number, number], h: [14, 18] as [number, number], pals: [['#B8AC98', '#8D8270', '#A39784']] as [string, string, string][] }

export function makeBuilding(r: Rng, id: string, type: string, angle: number): Building {
  const s = SPECS[type] ?? SHED
  const v = Math.floor(r() * s.n)
  const w = Math.round(range(r, ...s.w)), h = Math.round(range(r, ...s.h))
  const win: Box[] = []
  if (type === 'site') for (let i = 0; i < 3 + Math.floor(r() * 2); i++) win.push([-w / 2 + 5 + i * 10, h / 2 - 11, 4, 4])
  if (type === 'repo') for (let i = 0; i < 4; i++) win.push([-w / 2 + 8 + i * (w - 16) / 3, h / 2 - 9, 4, 5])
  return { id, type, v, x: 0, y: 0, w, h, rot: angle + range(r, -0.1, 0.1), pal: s.pals[Math.min(v, s.pals.length - 1)] ?? pick(r, s.pals), win }
}

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${extra}/>`
const line = (d: string, stroke: string, sw: number) => `<path d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`
const ribs = (x0: number, x1: number, y0: number, y1: number, n: number) =>
  Array.from({ length: n }, (_, i) => { const x = x0 + ((i + 1) * (x1 - x0)) / (n + 1); return `M${f1(x)} ${f1(y0)}V${f1(y1)}` }).join('')

// Body drawn in a frame centred on (0,0); the caller rotates and places it.
function body(b: Building): string {
  const { w, h, v, pal: [c, ridge, rib] } = b
  const x = -w / 2, y = -h / 2
  const shadow = rect(x + 3, y + 3, w, h, '#2A2A1E', ' opacity="0.14"')
  switch (b.type) {
    case 'cms': // greenhouse / conservatory / glasshouse
      if (v === 1) return shadow + rect(x, y, w, h * 0.7, c) + rect(x + w * 0.2, y + h * 0.7, w * 0.6, h * 0.3, c) + line(ribs(x, x + w, y, y + h * 0.7, Math.floor(w / 9)), rib, 1.1) + line(`M${x} ${y + h * 0.35}H${x + w}`, ridge, 1.6)
      if (v === 2) return shadow + rect(x, y, w * 0.55, h, c) + rect(x + w * 0.5, y + h * 0.15, w * 0.5, h * 0.85, c) + line(ribs(x, x + w, y, y + h, Math.floor(w / 9)), rib, 1.1) + line(`M${x} ${y + h / 2}H${x + w}`, ridge, 1.6)
      return shadow + rect(x, y, w, h, c) + line(ribs(x, x + w, y, y + h, Math.floor(w / 9)), rib, 1.1) + line(`M${x} 0H${x + w}`, ridge, 1.6)
    case 'repo': // warehouse / barn / workshop
      if (v === 2) return shadow + rect(x, y, w, h, c) + line(`M${x} 0H${x + w}`, ridge, 1.7) + rect(x + w * 0.38, y + h * 0.55, w * 0.24, h * 0.45, ridge) + line(ribs(x, x + w, y, y + h * 0.5, 4), rib, 0.9)
      if (v === 1) return shadow + rect(x, y, w, h, c) + line(`M${x} 0H${x + w}`, ridge, 1.7) + line(`M${x} ${y + h * 0.3}l${w / 6} ${-h * 0.3}l${w / 6} ${h * 0.3}l${w / 6} ${-h * 0.3}l${w / 6} ${h * 0.3}l${w / 6} ${-h * 0.3}l${w / 6} ${h * 0.3}`, rib, 1.1)
      return shadow + rect(x, y, w, h, c) + line(`M${x} 0H${x + w}`, ridge, 1.7) + line(ribs(x, x + w, y, y + h, 4), rib, 0.9)
    case 'site': // house / cottage / villa
      if (v === 1) return shadow + rect(x, y, w * 0.8, h, c) + line(`M${x + w * 0.4} ${y}V${y + h}`, ridge, 1.6) + rect(x + w * 0.8, y + h * 0.2, w * 0.2, h * 0.5, rib)
      if (v === 2) return shadow + rect(x, y, w * 0.7, h, c) + rect(x + w * 0.45, y + h * 0.3, w * 0.55, h * 0.7, c) + line(`M${x} 0H${x + w * 0.7}M${x + w * 0.45} ${y + h * 0.65}H${x + w}`, ridge, 1.6) + rect(x + w * 0.8, y + h * 0.35, w * 0.12, h * 0.2, rib)
      return shadow + rect(x, y, w, h, c) + line(`M${x} 0H${x + w}`, ridge, 1.6) + rect(x + w, y + h * 0.2, w * 0.36, h * 0.6, rib)
    case 'db': // silo / well
      return `<circle cx="2.5" cy="2.5" r="${w / 2}" fill="#2A2A1E" opacity="0.14"/><circle r="${w / 2}" fill="${c}"/><circle r="${w / 2 - 4}" fill="none" stroke="${ridge}" stroke-width="1.5"/><circle r="${v ? 2 : w / 5}" fill="${rib}"/>`
    case 'job': // mill: body plus a cross of sails
      return shadow + rect(x, y, w, h, c) + line(`M${x} 0H${x + w}`, ridge, 1.4) + line(`M0 ${-h * 0.9}V${h * 0.9}M${-w * 0.45} 0H${w * 0.45}`, rib, 2)
    default:
      return shadow + rect(x, y, w, h, c) + line(`M${x} 0H${x + w}`, ridge, 1.3)
  }
}

export const buildingSvg = (b: Building) => `<g transform="translate(${f1(b.x)} ${f1(b.y)}) rotate(${f1((b.rot * 180) / Math.PI)})">${body(b)}</g>`
// Live night layer: lit windows (a greenhouse glows as a whole). `lit` follows the node status.
export const lightsSvg = (b: Building, lit: boolean) =>
  `<g transform="translate(${f1(b.x)} ${f1(b.y)}) rotate(${f1((b.rot * 180) / Math.PI)})">` +
  (b.type === 'cms' ? (lit ? rect(-b.w / 2, -b.h / 2, b.w, b.h, '#FFE3A0', ' opacity="0.22"') : '') : b.win.map(([x, y, w, h]) => rect(x, y, w, h, lit ? '#FFD98A' : '#2A2F3A')).join('')) +
  '</g>' + (lit ? `<circle cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(Math.max(b.w, b.h) * 0.6)}" fill="url(#lampG)" opacity="0.5"/>` : '')
