import { useEffect, useRef } from 'react'
import type { Viewport } from '@xyflow/react'
import type { Scheme } from '../prefs'
import { levelFor } from '../lib/view'
import type { WorldData } from '../world'

interface Tile { z: number; x: number; y: number; src: string }
const keyOf = (t: Tile) => `${t.z}/${t.x}/${t.y}/${t.src}` // identical paper tiles share one file, so the file name alone is not a position
const KEEP = 48 // decoded tiles kept mounted after they scroll out of view

// Server-rendered map tiles under the React Flow viewport: only visible tiles are requested, recent ones stay mounted (LRU),
// and level 1 always sits under the sharper level so zooming never shows a hole while it loads.
export function TileLayer({ world, scheme, vp, size }: { world: WorldData; scheme: Scheme; vp: Viewport; size: { w: number; h: number } }) {
  const lru = useRef(new Map<string, Tile>())
  const loaded = useRef(new Set<string>())
  const reported = useRef(false)
  const { tiles } = world
  const T = tiles.size
  const level = levelFor(vp.zoom, window.devicePixelRatio) // level 0 is the preview's source, never fetched
  const nameAt = (theme: Scheme, z: number, x: number, y: number) => (x >= tiles.x0 && y >= tiles.y0 && x < tiles.x0 + tiles.cols && y < tiles.y0 + tiles.rows ? tiles.names[theme][z]?.[(y - tiles.y0) * tiles.cols + (x - tiles.x0)] : null)
  const srcOf = (name: string) => `/a/${name}`

  // viewport rect in world units, with half a tile of margin so panning rarely waits
  const m = T / 2
  const rx0 = -vp.x / vp.zoom - m, ry0 = -vp.y / vp.zoom - m, rx1 = (size.w - vp.x) / vp.zoom + m, ry1 = (size.h - vp.y) / vp.zoom + m
  const want: Tile[] = [], missing: [number, number, number][] = []
  for (const z of level > 1 ? [1, level] : [1]) {
    for (let y = Math.floor(ry0 / T); y <= Math.floor(ry1 / T); y++) for (let x = Math.floor(rx0 / T); x <= Math.floor(rx1 / T); x++) {
      const n = nameAt(scheme, z, x, y)
      if (n) want.push({ z, x, y, src: srcOf(n) })
      else if (n === null) missing.push([z, x, y]) // in the grid, not rendered yet
    }
  }
  for (const t of want) { lru.current.delete(keyOf(t)); lru.current.set(keyOf(t), t) }
  const wanted = new Set(want.map(keyOf))
  for (const k of lru.current.keys()) if (lru.current.size > KEEP && !wanted.has(k)) lru.current.delete(k)
  // drop tiles of another theme, or that a newer release replaced (the file name is the content hash)
  const mounted = [...lru.current.values()].filter((t) => t.src === (nameAt(scheme, t.z, t.x, t.y) ? srcOf(nameAt(scheme, t.z, t.x, t.y)!) : ''))

  const firstWave = useRef<string[] | null>(null)
  firstWave.current ??= want.filter((t) => t.z === 1 && t.x * T < rx1 - m && (t.x + 1) * T > rx0 + m && t.y * T < ry1 - m && (t.y + 1) * T > ry0 + m).map(keyOf)
  const onLoad = (k: string) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.opacity = '1'
    loaded.current.add(k)
    if (!reported.current && firstWave.current!.every((s) => loaded.current.has(s))) {
      reported.current = true
      performance.mark('tiles-visible')
    }
  }

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
        if (n) new Image().src = srcOf(n)
      }
    }, 1500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, world, level])

  const prev = world.previews[scheme]
  return (
    <>
      {/* paper under everything, so nothing the viewport shows is ever a bare background (the texture is a tile's own base, so it continues seamlessly) */}
      <div style={{ position: 'absolute', left: -102400, top: -102400, width: 204800, height: 204800, zIndex: -2, backgroundImage: `url(/a/${world.textures?.[scheme]?.[level]})`, backgroundSize: '1024px' }} />
      {prev && <img className="tile preview" src={`/a/${prev}`} onLoad={(e) => { e.currentTarget.style.opacity = '1' }} style={{ left: tiles.x0 * T, top: tiles.y0 * T, width: tiles.cols * T, height: tiles.rows * T, zIndex: -1 }} alt="" draggable={false} />}
      {mounted.map((t) => (
        <img key={keyOf(t)} className="tile" src={t.src} onLoad={onLoad(keyOf(t))} style={{ left: t.x * T, top: t.y * T, width: T, height: T, zIndex: t.z }} alt="" draggable={false} />
      ))}
    </>
  )
}
