import { createContext, createPortal, useContext, useEffect, useRef, useState } from 'react'
import type { Scheme } from '../prefs'
import type { TileView } from '../lib/view'
import type { WorldData } from '../world'
import { ensure, has } from '../engine/bitmaps'
import { createEngine, type Engine } from '../engine/engine'
import { tileLayer } from '../engine/tiles'
import { needs, nameAt as tileName, srcOf, wantOf } from './tiles'
import { frames } from './viewport'

// Where the canvas goes: WorldLayer's host under the scaled world layer (the canvas is not scaled by CSS, it draws the viewport itself).
export const TilesHost = createContext<HTMLElement | null>(null)

// Thin wrapper: the canvas engine draws the tiles (src/engine); this mounts it, feeds it world, theme and level, and tells the server what is missing.
export function TileLayer({ world, scheme, view }: { world: WorldData; scheme: Scheme; view: TileView }) {
  const host = useContext(TilesHost)
  const [cv, setCv] = useState<HTMLCanvasElement | null>(null)
  const [soft, setSoft] = useState(false) // a WebGL context that never came back: a fresh canvas drawn with 2D
  const eng = useRef<{ engine: Engine; layer: ReturnType<typeof tileLayer> }>()
  const reported = useRef(false)
  const { tiles } = world
  const T = tiles.size
  const { level } = view // level 0 is the preview's source, never fetched
  const nameAt = (theme: Scheme, z: number, x: number, y: number) => tileName(tiles, theme, z, x, y)

  const m = T / 2, [rx0, ry0, rx1, ry1] = view.rect
  const { want, missing } = wantOf(world, scheme, view)
  const firstWave = useRef<string[] | null>(null)
  firstWave.current ??= want.filter((t) => t.z === 1 && t.x * T < rx1 - m && (t.x + 1) * T > rx0 + m && t.y * T < ry1 - m && (t.y + 1) * T > ry0 + m).map((t) => t.src)

  useEffect(() => {
    if (!cv) return
    const engine = createEngine(cv, frames, { gl: !soft, onLost: () => setSoft(true) }), layer = tileLayer()
    engine.addLayer(layer)
    eng.current = { engine, layer }
    return () => { engine.destroy(); eng.current = undefined }
  }, [cv, soft])
  useEffect(() => { eng.current?.layer.set({ world, scheme, level }); eng.current?.engine.invalidate() }, [cv, world, scheme, level])

  // decode what the view draws from; each arrival redraws, and the first wave being drawn is the "tiles visible" mark
  const need = needs(world, scheme, view), needKey = need.join(';')
  useEffect(() => {
    const wave = () => { if (!reported.current && firstWave.current!.every(has)) { reported.current = true; performance.mark('tiles-visible') } }
    for (const src of need) ensure(src)?.then(() => { eng.current?.engine.invalidate(); wave() })
    wave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needKey, cv])

  // tell the server which tiles we are waiting for: they jump its queue, and the release event brings them
  const missKey = missing.join(';')
  useEffect(() => {
    if (!missKey) return
    const id = setTimeout(() => void fetch('/api/want', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: scheme, tiles: missing }) }).catch(() => {}), 150)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missKey, scheme])

  // warm the other theme's visible tiles once idle, so the theme switch is instant
  const other = scheme === 'light' ? 'night' : 'light'
  useEffect(() => {
    const id = setTimeout(() => {
      for (const t of want.filter((t) => t.z === level)) {
        const n = nameAt(other, t.z, t.x, t.y)
        if (n) ensure(srcOf(n))
      }
      if (world.previews[other]) ensure(srcOf(world.previews[other]!))
    }, 1500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, world, level])

  return host ? createPortal(<canvas key={String(soft)} ref={setCv} className="tiles" aria-hidden="true" />, host) : null
}
