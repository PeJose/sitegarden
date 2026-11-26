// Decoded tile bitmaps: fetched and decoded once, kept within a pixel budget, least recently drawn dropped first.
interface Entry { bmp?: ImageBitmap; p?: Promise<void>; used: number; px: number }
const cache = new Map<string, Entry>()
let frame = 0
// shortcut: fixed 32 Mpx (~128 MB RGBA), make it depend on navigator.deviceMemory when a low-end phone reports pressure
export const BUDGET = 32e6

// Keys to drop so the total fits the budget: oldest drawn first, never one drawn in the current (last) frame.
export function overBudget(es: { key: string; px: number; used: number }[], budget: number, now: number): string[] {
  let total = es.reduce((n, e) => n + e.px, 0)
  const out: string[] = []
  for (const e of [...es].sort((a, b) => a.used - b.used)) {
    if (total <= budget) break
    if (e.used >= now) continue
    out.push(e.key); total -= e.px
  }
  return out
}

// Start decoding `src` unless it is cached or in flight. Resolves when settled; a failed entry is dropped, so the next call retries.
export function ensure(src: string): Promise<void> | undefined {
  let e = cache.get(src)
  if (e) return e.bmp ? undefined : e.p
  const entry: Entry = (e = { used: frame, px: 0 })
  cache.set(src, entry)
  entry.p = fetch(src).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob() }).then((b) => createImageBitmap(b))
    .then((bmp) => { entry.bmp = bmp; entry.px = bmp.width * bmp.height; entry.used = frame }, () => { cache.delete(src) })
  return entry.p
}

export const beginFrame = () => { frame++ }
// The decoded bitmap, marked as drawn in this frame.
export function touch(src: string): ImageBitmap | undefined {
  const e = cache.get(src)
  if (e?.bmp) e.used = frame
  return e?.bmp
}
export const has = (src: string) => !!cache.get(src)?.bmp
export const cached = () => cache.size
export function trim(budget = BUDGET) {
  const done = [...cache].filter(([, e]) => e.bmp).map(([key, e]) => ({ key, px: e.px, used: e.used }))
  for (const k of overBudget(done, budget, frame)) { cache.get(k)!.bmp!.close(); cache.delete(k) }
}
