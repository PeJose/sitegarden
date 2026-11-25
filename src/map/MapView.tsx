import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Scheme } from '../prefs'
import { clampViewport, heroInset, initialViewport, PULL, minZoom, panExtent } from '../lib/view'
import type { WorldData } from '../world'
import { WorldLayer } from './WorldLayer'
import { endFlight, preloadTiles, startFlight } from './tiles'
import { PinNode } from './PinNode'
import { bindPane, place, toWorld, useSteppedZoom, viewport, type Limits } from './viewport'

// Centre a world point in the part of the map the hero does not cover.
const mapSize = { w: 1440, h: 900, collapsed: false } // kept current by MapView
const bounds = { current: { x: 0, y: 0, w: 1, h: 1 } as WorldData['bounds'] }
const scene = { world: null as WorldData | null, scheme: 'light' as Scheme }
const FLY_MS = 700
const limits = (): Limits => ({ w: mapSize.w, h: mapSize.h, min: minZoom(mapSize.w, mapSize.h, bounds.current), max: 2.5, extent: (z) => panExtent(bounds.current, mapSize.w, z, mapSize.collapsed) })
const targetOf = (x: number, y: number, zoom: number) => {
  const { w, h } = mapSize, left = heroInset(w, mapSize.collapsed)
  return clampViewport({ zoom, x: left + (w - left) / 2 - x * zoom, y: h / 2 - y * zoom }, panExtent(bounds.current, w, zoom, mapSize.collapsed), w, h)
}
// Fetch and decode the destination's tiles ahead of a fly-to (the sidebar rows call this on hover and focus).
export function preloadFly(x: number, y: number, zoom: number) {
  if (scene.world) preloadTiles(scene.world, scene.scheme, targetOf(x, y, zoom), mapSize)
}
export function flyTo(x: number, y: number, zoom: number) {
  preloadFly(x, y, zoom)
  startFlight(FLY_MS)
  viewport.animateTo(targetOf(x, y, zoom), FLY_MS).then((arrived) => arrived && endFlight())
}
// The zoom buttons: one step around the middle of the map (what d3-zoom's scaleBy did).
export function zoomBy(factor: number) {
  const v = viewport.current(), c: [number, number] = [mapSize.w / 2, mapSize.h / 2]
  endFlight()
  viewport.animateTo(place(v.zoom * factor, c, toWorld(v, c), limits()), 200)
}

export function MapView({ world, scheme, size, collapsed, onSelect }: { world: WorldData; scheme: Scheme; size: { w: number; h: number }; collapsed: boolean; onSelect: (id: string | null) => void }) {
  const pins = useMemo(() => world.estates.flatMap((e) => Object.entries(e.pins).map(([id, p]) => (
    <div key={id} className="pinbox" data-pin={id} tabIndex={0} style={{ transform: `translate(${p[0] - 17}px, ${p[1] - 17}px)` }}>
      <PinNode id={id} data={{ chip: e.chips[id], pin: p }} />
    </div>
  ))), [world])
  // Until the user moves the map, keep it framed when the window resizes or estates are planted.
  mapSize.w = size.w; mapSize.h = size.h
  const was = useRef(collapsed)
  mapSize.collapsed = collapsed
  bounds.current = world.bounds
  scene.world = world; scene.scheme = scheme
  const moved = useRef(false)
  const glide = useRef({ to: { x: 0, y: 0, zoom: 1 }, until: 0 })
  useState(() => viewport.set(initialViewport(size.w, size.h, world, collapsed))) // framed before the first render, so no tile is mounted for another view
  const zoom = useSteppedZoom() // stepped while zooming, exact at rest
  const pane = useRef<HTMLDivElement>(null), vp = useRef<HTMLDivElement>(null)
  const select = useRef(onSelect)
  useEffect(() => { select.current = onSelect })
  useLayoutEffect(() => { viewport.size = size }, [size])
  useLayoutEffect(() => {
    const apply = (v: { x: number; y: number; zoom: number }) => { vp.current!.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` }
    apply(viewport.get())
    const off = viewport.subscribe(apply)
    const unbind = bindPane(pane.current!, viewport, limits, { start: () => { moved.current = true; endFlight() }, end: endFlight, click: (pin) => select.current(pin) }) // the user took over mid-flight: show tiles for where it is now
    return () => { off(); unbind() }
  }, [])
  useEffect(() => {
    if (!moved.current) viewport.set(initialViewport(size.w, size.h, world, mapSize.collapsed))
  }, [size.w, size.h, world])
  // Pull the map along with the sliding panel: same curve as the CSS slide, no refit, no zoom change.
  useEffect(() => {
    if (was.current === collapsed) return
    was.current = collapsed
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320
    const base = performance.now() < glide.current.until ? glide.current.to : viewport.current() // mid-glide: start from where it was heading, so a double toggle cannot drift
    const to = clampViewport({ ...base, x: base.x + PULL * heroInset(size.w) * (collapsed ? -1 : 1) }, panExtent(world.bounds, size.w, base.zoom, collapsed), size.w, size.h) // the new state's extent: one movement, no snap
    if (Math.abs(to.x - base.x) < 8) return
    glide.current = { to, until: performance.now() + ms }
    viewport.animateTo(to, ms, (t) => 1 - (1 - t) ** 3).then((arrived) => arrived && endFlight())
  }, [collapsed, size.w, size.h, world.bounds])
  // Level of detail by on-screen size, as CSS variables the pins and chips read: chips (11.5 px text) fade out below ~10 px, pins never shrink under ~24 px.
  const lod = { '--pin-k': Math.max(1, 24 / (30 * zoom)), '--chip-o': Math.min(1, Math.max(0, (11.5 * zoom - 9) / 1.5)), '--hover-k': Math.min(2.5, Math.max(1, 11 / (11.5 * zoom))) } as CSSProperties
  return (
    <div style={{ display: 'contents', ...lod }}>
      <WorldLayer world={world} scheme={scheme} size={size} />
      <div className="pane" ref={pane}>
        <div className="viewport" ref={vp}>
          {pins}
        </div>
      </div>
    </div>
  )
}
