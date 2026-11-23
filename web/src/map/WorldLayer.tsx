import { memo, useMemo } from 'react'
import { useViewport } from '@xyflow/react'
import { useEngine } from '../mock/engine'
import { edges } from '../mock/data'
import type { Scheme } from '../prefs'
import { DEFS, campfireParts, twinkleSvg } from '../gen/render'
import { lightsSvg } from '../gen/buildings'
import type { WorldData } from '../world'
import { TileLayer } from './TileLayer'
import { Fx, Lantern, March, Wash } from './Fx'

// The baked world (server tiles) sits under React Flow and follows its viewport transform. On top of it,
// everything that depends on live status is drawn from the World JSON: red wash, lit windows, fires, flows, labels.
export function WorldLayer({ world, scheme, size }: { world: WorldData; scheme: Scheme; size: { w: number; h: number } }) {
  const vp = useViewport()
  return (
    <div className="world" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}>
      <TileLayer world={world} scheme={scheme} vp={vp} size={size} />
      <Live world={world} scheme={scheme} />
      <Labels world={world} zoom={vp.zoom} />
    </div>
  )
}

const Live = memo(function Live({ world, scheme }: { world: WorldData; scheme: Scheme }) {
  const night = scheme === 'night'
  const flows = useEngine((s) => s.flows)
  const status = useEngine((s) => s.nodes)
  const { bounds: b } = world
  const stars = useMemo(() => twinkleSvg(world), [world])
  const roads = useMemo(() => Object.fromEntries(world.estates.flatMap((e) => e.roads).map((r) => [r.id, r])), [world])
  const blds = world.estates.flatMap((e) => e.buildings)
  const at = { left: b.x, top: b.y, width: b.w, height: b.h }
  return (
    <>
      {/* one hidden copy of the defs for every live svg below to reference */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs dangerouslySetInnerHTML={{ __html: DEFS[scheme] }} /></svg>
      {/* each animation is its own layer in world coordinates; same stacking order as before: stars, wash, windows, fires, lanterns, dashes */}
      {night && stars.map((html, i) => <Fx key={'s' + i} box={[b.x, b.y, b.w, b.h]} className={`tw${i + 1}`} html={html} />)}
      {blds.map((bl) => <Wash key={bl.id} x={bl.x} y={bl.y} down={status[bl.id]?.status === 'down'} />)}
      <svg className="live" style={at} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true">
        {night && blds.map((bl) => <g key={'l' + bl.id} dangerouslySetInnerHTML={{ __html: lightsSvg(bl, status[bl.id]?.status !== 'down') }} />)}
      </svg>
      {night && world.estates.flatMap((e) => campfireParts(e.campfire).map((p, i) => <Fx key={`f${e.id}${i}`} box={p.box} className={p.cls} html={p.svg} />))}
      {edges.map((e) => roads[e.id] && flows[e.id] === 'deploy' && night && <Lantern key={'l' + e.id} d={roads[e.id].d} />)}
      {edges.map((e) => roads[e.id] && flows[e.id] && <March key={e.id} d={roads[e.id].d} />)}
    </>
  )
})

// Estate names and path labels follow the viewport: their on-screen size stays between a minimum and a maximum. Estate names always show; path labels fade out when zoomed so far out they would only overlap.
function Labels({ world, zoom }: { world: WorldData; zoom: number }) {
  const { bounds: b } = world
  const px = (natural: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, natural * zoom)) / zoom
  const fr = Math.min(px(11.5, 9.5, 13.5), 11.5 * 1.35) /* never wider than the room the generator reserved */, fe = px(13, 11, 17)
  const roads = world.estates.flatMap((e) => e.roads)
  return (
    <svg className="live" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true">
      <defs>{roads.map((r) => <path key={r.id} id={`rl-${r.id}`} d={r.labelPath} />)}</defs>
      <g className="est-labels" style={{ fontSize: fe, letterSpacing: fe * 0.2, strokeWidth: fe / 3 }}>{world.estates.map((e) => <text key={e.id} x={e.tag.x} y={e.tag.y}>{e.tag.text}</text>)}</g>
      <g className="road-labels" style={{ opacity: Math.min(1, Math.max(0, (11.5 * zoom - 7) / 2)), fontSize: fr, letterSpacing: fr * 0.09, strokeWidth: fr * 0.27 }}>
        {roads.map((r) => <text key={r.id} dy={fr * 0.35}><textPath href={`#rl-${r.id}`} startOffset={`${r.labelAt * 100}%`} textAnchor="middle">{r.label}</textPath></text>)}
      </g>
    </svg>
  )
}
