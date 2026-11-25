import { useEffect, useRef } from 'react'
import type { JSX } from 'preact'
import type { Scheme } from '../prefs'
import type { TileView } from '../lib/view'
import type { WorldData } from '../world'
import { evict, nameAt as tileName, srcOf, wantOf, type Tile } from './tiles'

const keyOf = (t: Tile) => `${t.z}/${t.x}/${t.y}/${t.src}` // identical paper tiles share one file, so the file name alone is not a position
// shortcut: 96 tiles (~20 MB decoded on a phone) incl. sharper leftovers, no memory-based budget; revisit if low-end phones reload the page
const KEEP = 96 // decoded tiles kept mounted after they scroll out of view or the level drops

// Server-rendered map tiles under the React Flow viewport: only visible tiles are requested, recent ones stay mounted (LRU),
// and level 1 always sits under the sharper level so zooming never shows a hole while it loads.
export function TileLayer({ world, scheme, view }: { world: WorldData; scheme: Scheme; view: TileView }) {
  const lru = useRef(new Map<string, Tile>())
  const loaded = useRef(new Set<string>())
  const reported = useRef(false)
  const { tiles } = world
  const T = tiles.size
  const { level } = view // level 0 is the preview's source, never fetched
  const nameAt = (theme: Scheme, z: number, x: number, y: number) => tileName(tiles, theme, z, x, y)

  const m = T / 2, [rx0, ry0, rx1, ry1] = view.rect
  const { want, missing } = wantOf(world, scheme, view)
  for (const t of want) { lru.current.delete(keyOf(t)); lru.current.set(keyOf(t), t) }
  const wanted = new Set(want.map(keyOf))
  evict(lru.current, wanted, view, KEEP)
  // drop tiles of another theme, or that a newer release replaced (the file name is the content hash)
  const mounted = [...lru.current.values()].filter((t) => t.src === (nameAt(scheme, t.z, t.x, t.y) ? srcOf(nameAt(scheme, t.z, t.x, t.y)!) : ''))

  const firstWave = useRef<string[] | null>(null)
  firstWave.current ??= want.filter((t) => t.z === 1 && t.x * T < rx1 - m && (t.x + 1) * T > rx0 + m && t.y * T < ry1 - m && (t.y + 1) * T > ry0 + m).map(keyOf)
  const onLoad = (k: string) => (e: JSX.TargetedEvent<HTMLImageElement>) => {
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
      {prev && <img className="tile preview" decoding="async" src={`/a/${prev}`} onLoad={(e) => { e.currentTarget.style.opacity = '1' }} style={{ left: tiles.x0 * T, top: tiles.y0 * T, width: tiles.cols * T, height: tiles.rows * T, zIndex: -1 }} alt="" draggable={false} />}
      {mounted.map((t) => (
        <img key={keyOf(t)} className="tile" decoding="async" src={t.src} onLoad={onLoad(keyOf(t))} style={{ left: t.x * T, top: t.y * T, width: T, height: T, zIndex: t.z }} alt="" draggable={false} />
      ))}
    </>
  )
}
