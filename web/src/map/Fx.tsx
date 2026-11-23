import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

// Every animated thing lives in its own small absolutely positioned wrapper in world coordinates, so the compositor
// animates it (opacity / transform) without repainting the world-sized svg. The svg inside references the hidden defs.
export type FxBox = [number, number, number, number] // x y w h, world coordinates
export function Fx({ box: [x, y, w, h], className = '', style, html, children, onTransitionEnd }: { box: FxBox; className?: string; style?: CSSProperties; html?: string; children?: ReactNode; onTransitionEnd?: () => void }) {
  return (
    <div className={`fx ${className}`} style={{ left: x, top: y, width: w, height: h, ...style }} onTransitionEnd={onTransitionEnd}>
      <svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} overflow="visible" aria-hidden="true" dangerouslySetInnerHTML={html === undefined ? undefined : { __html: html }}>{children}</svg>
    </div>
  )
}

// Red wash: mounted only while the building is down. Fades in and out over 1.4 s on the wrapper's opacity, unmounted after the fade-out.
export function Wash({ x, y, down }: { x: number; y: number; down: boolean }) {
  const [mounted, setMounted] = useState(down)
  const [on, setOn] = useState(down)
  useEffect(() => {
    if (!down) { setOn(false); if (matchMedia('(prefers-reduced-motion: reduce)').matches) setMounted(false); return } // no transition under reduced motion, so no transitionend
    setMounted(true)
    let dead = false
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { if (!dead) setOn(true) })) // second frame, so 0 -> 1 is seen as a transition
    return () => { dead = true; cancelAnimationFrame(id) }
  }, [down])
  if (!mounted) return null
  return (
    <Fx box={[x - 70, y - 70, 140, 140]} className="wash-fade" style={{ opacity: on ? 1 : 0, willChange: 'opacity' }} onTransitionEnd={() => { if (!on) setMounted(false) }}>
      <g transform={`translate(${x} ${y})`}><g filter="url(#aq)"><circle r="70" fill="#C25A4A" opacity="0.3" /><circle r="38" fill="#B8443A" opacity="0.25" /></g></g>
    </Fx>
  )
}

// Deploy lantern: the old SMIL animateMotion, as a transform animation over points sampled once along the road (same 3.2 s linear loop).
const STEPS = 48
function samplePath(d: string): [number, number][] {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', d)
  const len = p.getTotalLength()
  return Array.from({ length: STEPS + 1 }, (_, i) => { const q = p.getPointAtLength((len * i) / STEPS); return [q.x, q.y] })
}
export function Lantern({ d }: { d: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const pts = useMemo(() => samplePath(d), [d])
  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return // stays at the road's start
    const a = el.animate(pts.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` })), { duration: 3200, iterations: Infinity, easing: 'linear' })
    const vis = () => (document.hidden ? a.pause() : a.play())
    vis()
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); a.cancel() }
  }, [pts])
  return (
    <div ref={ref} className="fx" style={{ left: -7, top: -7, width: 14, height: 14, willChange: 'transform', transform: `translate(${pts[0][0]}px, ${pts[0][1]}px)` }}>
      <svg width="14" height="14" viewBox="-7 -7 14 14" overflow="visible" aria-hidden="true"><circle r="7" fill="#FFC56B" filter="url(#glow)" /></svg>
    </div>
  )
}

// Marching dashes: stroke-dashoffset cannot run on the compositor, so the road gets its own layer sized to its bbox (a cubic stays inside its control points).
export function March({ d }: { d: string }) {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1)
  const pad = 6, x = Math.min(...xs) - pad, y = Math.min(...ys) - pad
  return (
    <Fx box={[x, y, Math.max(...xs) + pad - x, Math.max(...ys) + pad - y]} style={{ willChange: 'transform' }}>
      <path className="march" d={d} fill="none" stroke="#D98A1C" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" />
    </Fx>
  )
}
