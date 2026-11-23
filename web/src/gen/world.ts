import { genEstate } from './estate'
import { union } from './geom'
import { genHood } from './hood'
import { layout } from './layout'
import { tiledBox } from '../lib/view'
import { range, rngFor } from './rng'
import type { Config, Positions, World } from './types'

const PAD = 520 // blank paper around the outermost estate, so the map can be panned past the edge

// Pure and deterministic: same config + saved positions -> identical World. Estates are generated from their own id,
// so adding or removing one changes nothing about the others except where the layout puts new ones.
export function generateWorld(cfg: Config, saved: Positions = {}): World {
  const seed = cfg.accountSeed
  const angle = -0.42 + range(rngFor(seed, 'hood', 'angle'), -0.07, 0.07)
  const probe = cfg.estates.map((ce) => ({ id: ce.id, poly: genEstate(seed, ce, 0, 0, angle).poly }))
  const positions = layout(seed, probe, saved)
  const estates = cfg.estates.map((ce) => genEstate(seed, ce, positions[ce.id].x, positions[ce.id].y, angle))
  const bb = estates.length ? union(estates.map((e) => e.bb)) : [-400, -300, 400, 300]
  const x = Math.floor((bb[0] - PAD) / 64) * 64, y = Math.floor((bb[1] - PAD) / 64) * 64
  const bounds = { x, y, w: Math.ceil((bb[2] + PAD - x) / 64) * 64, h: Math.ceil((bb[3] + PAD - y) / 64) * 64 }
  return { seed, bounds, estates, hood: genHood(seed, estates, tiledBox(bounds), angle), positions }
}
