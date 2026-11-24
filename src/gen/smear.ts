import { f1 } from './geom'
import { range, type Rng } from './rng'
import type { Box } from './types'

// Estimated text width from font metrics (Outfit 600 15px +3px tracking, JetBrains Mono 11.5px +1px tracking).
export const textW = (t: string, mono = false) => t.length * (mono ? 8 : 12.4)

// Soft paper-coloured smear around measured text boxes: one rounded rect per box with a seeded corner radius.
// The smearT / smearS filters from the design make the edge irregular and fade it out.
export function smearRects(boxes: Box[], r: Rng, pad = 0): string {
  return boxes.map(([x0, y0, x1, y1]) => {
    const x = x0 - pad, y = y0 - pad, w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad
    return `<rect x="${f1(x + range(r, -3, 3))}" y="${f1(y + range(r, -2, 2))}" width="${f1(w)}" height="${f1(h)}" rx="${f1(Math.min(h / 2, range(r, 14, 30)))}"/>`
  }).join('')
}
