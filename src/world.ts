import { useSyncExternalStore } from 'react'
import type { Estate, Pt, World } from './gen/types'
import { setConfig } from './mock/data'
import { engine } from './mock/engine'
import { configReady } from './ext/registry'

export interface TileIndex { size: number; x0: number; y0: number; cols: number; rows: number; names: Record<'light' | 'night', (string | null)[][]> } // names[theme][zoom level][row * cols + col]
export type WorldData = World & { id: string; tiles: TileIndex; previews: Partial<Record<'light' | 'night', string>>; textures: Record<'light' | 'night', string[]> }
interface Release { id: string; rev: number; world: string; config: string; tiles: TileIndex; previews: WorldData['previews']; textures: WorldData['textures']; estates: Record<string, string> }

let world: WorldData | null = null
let rev = -1
const subs = new Set<() => void>()
const waiting = new Set<{ ok: (r: Release) => boolean; done: () => void }>()
export const getWorld = () => world
export const useWorld = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getWorld)

// The server renders everything: a release is a tiny manifest naming immutable files (world JSON, config, tiles, previews).
async function loadRelease() {
  const res = await fetch('/api/release')
  if (!res.ok) return // nothing rendered yet; the event stream announces the first release
  const r: Release = await res.json()
  if (r.id === world?.id) { // same map, more tiles rendered since
    if (r.rev === rev) return
    rev = r.rev
    world = { ...world, tiles: r.tiles, previews: r.previews, textures: r.textures }
    subs.forEach((f) => f())
    return
  }
  rev = r.rev
  const [cfg, w] = await Promise.all([fetch(`/a/${r.config}`).then((x) => x.json()), fetch(`/a/${r.world}`).then((x) => x.json()), configReady])
  performance.mark('world-json')
  // one synchronous burst, so React renders config, engine and world together
  setConfig(cfg)
  engine.sync()
  world = { ...w, id: r.id, tiles: r.tiles, previews: r.previews, textures: r.textures }
  subs.forEach((f) => f())
  waiting.forEach((x) => { if (x.ok(r)) { waiting.delete(x); x.done() } })
}

let events: EventSource | undefined
export async function loadWorld() {
  if (!events) { events = new EventSource('/api/events'); events.addEventListener('release', () => void loadRelease()) }
  await loadRelease()
}

// Planting only edits sitegarden.yaml on the server; resolve once a release containing the change is live.
const released = (ok: (r: Release) => boolean) => new Promise<void>((done) => { waiting.add({ ok, done }); setTimeout(done, 60_000) })
export async function plantEstate(): Promise<string | null> {
  const r = await fetch('/api/estates', { method: 'POST' }).then((x) => x.json())
  if (r.id) await released((x) => r.id in x.estates)
  return r.id ?? null
}
export async function removeLastEstate(): Promise<string | null> {
  const r = await fetch('/api/estates/last', { method: 'DELETE' }).then((x) => x.json())
  if (r.id) await released((x) => !(r.id in x.estates))
  return r.id ?? null
}

export const estateOf = (id: string): Estate | undefined => world?.estates.find((e) => e.id === id)
export const pinAt = (nodeId: string): Pt => {
  for (const e of world!.estates) if (e.pins[nodeId]) return e.pins[nodeId]
  return [0, 0]
}
