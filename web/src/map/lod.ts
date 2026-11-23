// Calls apply with the zoom snapped to 1/16 of a doubling whenever the step changes, and with the exact zoom once the view has been still for a moment.
// Keeps label text and pin/chip styles from being recomputed every frame of a zoom.
export function followZoom(store: { getState(): { transform: number[] }; subscribe(f: (s: { transform: number[] }) => void): () => void }, apply: (zoom: number) => void) {
  let zoom = store.getState().transform[2], step = NaN, timer = 0
  apply(zoom)
  const off = store.subscribe((s) => {
    const z = s.transform[2]
    if (z === zoom) return
    zoom = z
    const q = 2 ** (Math.round(Math.log2(z) * 16) / 16)
    if (q !== step) { step = q; apply(q) }
    clearTimeout(timer)
    timer = window.setTimeout(() => apply(z), 120)
  })
  return () => { off(); clearTimeout(timer) }
}
