import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { ReactFlow, useReactFlow, useViewport, type Node } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import type { Scheme } from '../prefs'
import { clampViewport, heroInset, initialViewport, PULL, minZoom, panExtent } from '../lib/view'
import type { WorldData } from '../world'
import { WorldLayer } from './WorldLayer'
import { PinNode } from './PinNode'

const nodeTypes = { pin: PinNode }
const proOptions = { hideAttribution: true }

// Centre a world point in the part of the map the hero does not cover.
const mapSize = { w: 1440, h: 900, collapsed: false } // kept current by MapView
const bounds = { current: { x: 0, y: 0, w: 1, h: 1 } as WorldData['bounds'] }
export function useFlyTo() {
  const { setViewport } = useReactFlow()
  return (x: number, y: number, zoom: number) => {
    const { w, h } = mapSize, left = heroInset(w, mapSize.collapsed)
    const b = bounds.current
    setViewport(clampViewport({ zoom, x: left + (w - left) / 2 - x * zoom, y: h / 2 - y * zoom }, panExtent(b, w, zoom, mapSize.collapsed), w, h), { duration: 700 })
  }
}

export function MapView({ world, scheme, size, collapsed, onSelect }: { world: WorldData; scheme: Scheme; size: { w: number; h: number }; collapsed: boolean; onSelect: (id: string | null) => void }) {
  const nodes = useMemo<Node[]>(
    () => world.estates.flatMap((e) => Object.entries(e.pins).map(([id, p]) => ({ e, id, p }))).map(({ e, id, p }) => ({
      id, type: 'pin', position: { x: p[0] - 17, y: p[1] - 17 }, data: { chip: e.chips[id], pin: p }, width: 34, height: 34, draggable: false, connectable: false,
    })),
    [world],
  )
  // Until the user moves the map, keep it framed when the window resizes or estates are planted.
  mapSize.w = size.w; mapSize.h = size.h
  const was = useRef(collapsed)
  mapSize.collapsed = collapsed
  bounds.current = world.bounds
  const moved = useRef(false)
  const { setViewport, getViewport } = useReactFlow()
  const glide = useRef({ to: { x: 0, y: 0, zoom: 1 }, until: 0 })
  const { zoom } = useViewport()
  const [[ex0, ey0], [ex1, ey1]] = panExtent(world.bounds, size.w, zoom, collapsed)
  const extent = useMemo<[[number, number], [number, number]]>(() => [[ex0, ey0], [ex1, ey1]], [ex0, ey0, ex1, ey1])
  useEffect(() => {
    if (!moved.current) setViewport(initialViewport(size.w, size.h, world, mapSize.collapsed))
  }, [size.w, size.h, world, setViewport])
  // Pull the map along with the sliding panel: same curve as the CSS slide, no refit, no zoom change.
  useEffect(() => {
    if (was.current === collapsed) return
    was.current = collapsed
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320
    const base = performance.now() < glide.current.until ? glide.current.to : getViewport() // mid-glide: start from where it was heading, so a double toggle cannot drift
    const to = clampViewport({ ...base, x: base.x + PULL * heroInset(size.w) * (collapsed ? -1 : 1) }, panExtent(world.bounds, size.w, base.zoom, collapsed), size.w, size.h) // the new state's extent: one movement, no snap
    if (Math.abs(to.x - base.x) < 8) return
    glide.current = { to, until: performance.now() + ms }
    setViewport(to, { duration: ms, ease: (t) => 1 - (1 - t) ** 3 })
  }, [collapsed, size.w, size.h, world.bounds, getViewport, setViewport])
  // Level of detail by on-screen size, as CSS variables the pins and chips read: chips (11.5 px text) fade out below ~10 px, pins never shrink under ~24 px.
  const lod = { '--pin-k': Math.max(1, 24 / (30 * zoom)), '--chip-o': Math.min(1, Math.max(0, (11.5 * zoom - 9) / 1.5)), '--hover-k': Math.min(2.5, Math.max(1, 11 / (11.5 * zoom))) } as CSSProperties
  return (
    <div style={{ display: 'contents', ...lod }}>
      <WorldLayer world={world} scheme={scheme} size={size} />
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        defaultViewport={initialViewport(size.w, size.h, world, collapsed)}
        minZoom={minZoom(size.w, size.h, world.bounds)}
        maxZoom={2.5}
        translateExtent={extent}
        proOptions={proOptions}
        elementsSelectable={false}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        onMoveStart={(e) => { if (e) moved.current = true }}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
      />
    </div>
  )
}
