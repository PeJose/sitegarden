import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEngine } from '../mock/engine'
import { edges } from '../mock/data'
import type { Scheme } from '../prefs'
import { DEFS, twinkleSvg } from '../gen/render'
import { lightsSvg } from '../gen/buildings'
import type { WorldData } from '../world'
import { viewOf, type TileView } from '../lib/view'
import { extConfig, registry } from '../ext/registry'
import { flight } from './tiles'
import { useViewport, viewport } from './viewport'
import { Lantern, March, Wash } from './Fx'

// The baked world (server tiles) sits under the pins and follows the viewport transform. On top of it,
// everything that depends on live status is drawn from the World JSON: red wash, lit windows, fires, flows, labels.
// The transform is written straight to the DOM from the viewport store; React only re-renders when the tile level or the visible tile range changes.
export const WorldLayer = memo(function WorldLayer({ world, scheme, size }: { world: WorldData; scheme: Scheme; size: { w: number; h: number } }) {
  const paper = useRef<HTMLDivElement>(null), el = useRef<HTMLDivElement>(null)
  const T = world.tiles.size
  const [view, setView] = useState<TileView>(() => viewOf(viewport.get(), T, size, window.devicePixelRatio))
  useLayoutEffect(() => {
    let key = ''
    const apply = ({ x, y, zoom }: { x: number; y: number; zoom: number }) => {
      const k = 1024 * zoom // the texture repeats every 1024 world units
      el.current!.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`
      paper.current!.style.backgroundSize = `${k}px`
      paper.current!.style.backgroundPosition = `${x % k}px ${y % k}px`
      const v = viewOf({ x, y, zoom }, T, size, window.devicePixelRatio)
      const kk = `${v.level}/${v.c0}/${v.c1}/${v.r0}/${v.r1}`
      if (kk !== key && !flight.active) { key = kk; setView(v) } // mid-flight the mounted tiles stay as they are; landing calls apply again
    }
    apply(viewport.get())
    const land = () => apply(viewport.get())
    flight.onEnd.add(land)
    const off = viewport.subscribe(apply)
    return () => { off(); flight.onEnd.delete(land) }
  }, [T, size])
  const tex = world.textures?.[scheme]?.[view.level]
  return (
    <>
    {/* paper under everything, one screen big: the texture is a tile's own base, so it continues seamlessly under the tiles */}
    <div className="paper" ref={paper} style={{ backgroundImage: `url(/a/${tex})` }} />
    <div className="world" ref={el}>
      {registry.resolve('map', 'layers', extConfig.extensions).map((l) => <Fragment key={l.id}>{l.render({ world, scheme, view })}</Fragment>)}
    </div>
    </>
  )
})

export const Live = memo(function Live({ world, scheme }: { world: WorldData; scheme: Scheme }) {
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
      {/* each animation is its own layer in world coordinates; same stacking order as before: wash, stars and windows, lanterns, dashes */}
      {blds.map((bl) => <Wash key={bl.id} x={bl.x} y={bl.y} down={status[bl.id]?.status === 'down'} />)}
      <svg className="live" style={at} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true">
        {night && stars.map((html, i) => <g key={'s' + i} dangerouslySetInnerHTML={{ __html: html }} />)}
        {night && blds.map((bl) => <g key={'l' + bl.id} dangerouslySetInnerHTML={{ __html: lightsSvg(bl, status[bl.id]?.status !== 'down') }} />)}
      </svg>
      {edges.map((e) => roads[e.id] && flows[e.id] === 'deploy' && night && <Lantern key={'l' + e.id} d={roads[e.id].d} />)}
      {edges.map((e) => roads[e.id] && flows[e.id] && <March key={e.id} d={roads[e.id].d} />)}
    </>
  )
})

// Estate names and path labels follow the viewport: their on-screen size stays between a minimum and a maximum. Estate names always show; path labels fade out when zoomed so far out they would only overlap.
export function Labels({ world }: { world: WorldData }) {
  const zoom = useViewport((v) => v.zoom) // task 2.4 steps this
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
