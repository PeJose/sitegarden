// One frame owner: input, flights and invalidations all land in a single rAF per frame, where the canvas draws and the DOM layers move with
// the same viewport, so a slow canvas frame can never leave pins and labels showing another view than the map under them.
export interface View { x: number; y: number; zoom: number }
export type Applier = (v: View, now: number) => void

// `raf`/`caf` are one-shots that run at the top of the frame (the viewport store's env), `onFrame` appliers run after them with the settled view.
export function createFrames(view: () => View, raf: (f: FrameRequestCallback) => number = (f) => requestAnimationFrame(f), caf: (id: number) => void = (i) => cancelAnimationFrame(i)) {
  const appliers = new Set<Applier>(), once = new Map<number, (now: number) => void>()
  let id = 0, n = 0, running = false
  const again = () => { id ||= raf(run) }
  function run(now: number) {
    id = 0; running = true
    try {
      const q = [...once.values()]; once.clear()
      for (const f of q) f(now)
      const v = view()
      for (const f of [...appliers]) f(v, now)
    } finally { running = false }
  }
  return {
    // The viewport changed: a frame follows (not when it changed inside the frame, the appliers run right after).
    request() { if (!running) again() },
    again, // another frame after this one (animations)
    view,
    onFrame(f: Applier) { appliers.add(f); again(); return () => { appliers.delete(f) } },
    raf(f: (now: number) => void) { once.set(++n, f); again(); return n },
    caf(i: number) { once.delete(i) },
    destroy() { if (id) caf(id); id = 0 },
  }
}
export type Frames = ReturnType<typeof createFrames>
