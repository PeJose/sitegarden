import rough from 'roughjs'
import { hash } from '../gen/rng'

type P = { d: string; stroke: string; strokeWidth: number; fill?: string }
const gen = rough.generator()
const cache = new Map<string, P[]>()
const paths = (dr: ReturnType<typeof gen.path>): P[] => gen.toPaths(dr).map((p) => ({ d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth, fill: p.fill }))

// Hand-drawn pin (ring + icon), seeded per node and status so it never jitters; drawn once, kept as plain SVG paths so it stays crisp at any zoom.
export function roughPin(id: string, status: string, shape: 'circle' | 'square' | 'diamond', color: string, iconD: string): P[] {
  const key = `${id}|${status}`
  let out = cache.get(key)
  if (!out) {
    const seed = (hash(id, status) % 2147483646) + 1
    const o = { seed, roughness: 1.3, bowing: 1 }
    const body =
      shape === 'diamond' ? gen.polygon([[0, -22], [22, 0], [0, 22], [-22, 0]], { ...o, stroke: '#fff', strokeWidth: 3, fill: color, fillStyle: 'solid' })
      : shape === 'square' ? gen.path('M-8 -17H8Q17 -17 17 -8V8Q17 17 8 17H-8Q-17 17 -17 8V-8Q-17 -17 -8 -17Z', { ...o, stroke: color, strokeWidth: 3, fill: '#fff', fillStyle: 'solid' })
      : gen.circle(0, 0, 34, { ...o, stroke: color, strokeWidth: 3, fill: '#fff', fillStyle: 'solid' })
    out = [...paths(body), ...paths(gen.path(iconD, { seed: seed + 1, roughness: 0.9, stroke: shape === 'diamond' ? '#fff' : color, strokeWidth: 1.8 }))]
    cache.set(key, out)
  }
  return out
}
