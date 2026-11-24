// Seeded randomness: cyrb53 string hash -> mulberry32. Every entity draws from hash(accountSeed, entityId, purpose),
// so adding or removing one entity never shifts the random stream of another.
export type Rng = () => number

export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function mulberry32(a: number): Rng {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const hash = (...parts: (string | number)[]) => cyrb53(parts.join('|'))
export const rngFor = (...parts: (string | number)[]): Rng => mulberry32(hash(...parts))
export const range = (r: Rng, a: number, b: number) => a + (b - a) * r()
export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
export const hex = (n: number) => n.toString(36)

// Smooth 1D/2D value noise from the integer-lattice hash; deterministic in (seed, coords).
const lat = (seed: string, i: number, j: number) => mulberry32(hash(seed, i, j))()
const fade = (t: number) => t * t * (3 - 2 * t)
export function noise2(seed: string, x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), u = fade(x - i), v = fade(y - j)
  const a = lat(seed, i, j), b = lat(seed, i + 1, j), c = lat(seed, i, j + 1), d = lat(seed, i + 1, j + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
// Periodic 1D noise around a circle of `n` lattice points (t in [0,1)), used for the plot outline radius.
export function ring(r: Rng, n: number): (t: number) => number {
  const v = Array.from({ length: n }, r)
  return (t) => {
    const x = t * n, i = Math.floor(x), f = fade(x - i)
    return v[i % n] + (v[(i + 1) % n] - v[i % n]) * f
  }
}
