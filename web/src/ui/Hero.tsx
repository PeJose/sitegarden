import { useReactFlow } from '@xyflow/react'
import { useFlyTo } from '../map/MapView'
import { engine, useEngine } from '../mock/engine'
import { summarize } from '../summary'
import { useNow } from '../lib/time'
import { edges, nodeById } from '../mock/data'
import { estateOf, plantEstate, useWorld } from '../world'
import { nodes } from '../mock/data'
import { useMemo } from 'react'
import type { Estate } from '../gen/types'
import { Dot, colorOf } from './Dots'
import type { Status } from '../mock/types'

const chev = (left: boolean) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>

const logo = <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="11" cy="13" r="8" fill="#94A86C" opacity="0.9"/><circle cx="19" cy="11" r="7" fill="#62784A" opacity="0.9"/><circle cx="16" cy="18" r="7" fill="#AFBD84" opacity="0.85"/><path d="M15 21v7" stroke="var(--logo-stem)" strokeWidth="1.6" strokeLinecap="round"/></svg>

// What stays on screen when the panel is hidden: the logo and how many things need a look.
function HeroTab({ onToggle }: { onToggle: () => void }) {
  const st = useEngine((s) => s)
  const probs = nodes.map((n) => st.nodes[n.id].status).filter((s) => s === 'down' || s === 'degraded')
  const worst: Status = probs.includes('down') ? 'down' : probs.length ? 'degraded' : 'ok'
  return (
    <button className="hero-tab" onClick={onToggle} aria-label={`Show the menu (${probs.length ? `${probs.length} need attention` : 'all well'})`} aria-expanded={false} aria-keyshortcuts="[" title="Show the menu ([)">
      {logo}
      <Dot status={worst} size={10} />
      {probs.length > 0 && <b>{probs.length}</b>}
      {chev(false)}
    </button>
  )
}

export function Hero({ onPanel, say, collapsed, onToggle }: { onPanel: (p: 'inventory' | 'links') => void; say: (m: string) => void; collapsed: boolean; onToggle: () => void }) {
  const st = useEngine((s) => s)
  const now = useNow(15000)
  const sum = summarize(st, now)
  const { getZoom } = useReactFlow(), flyTo = useFlyTo()
  const fly = (id: string) => { const e = estateOf(id); if (e) flyTo(e.cx, e.cy, Math.max(getZoom(), 1.3)) }
  useWorld()
  const redeploy = sum.first && edges.find((e) => e.type === 'deploy' && nodeById(e.from)?.group === sum.first!.group)
  return (
    <>
    <section className="hero" inert={collapsed}>
      <div className="brand">
        {logo}
        <span>sitegarden</span>
      </div>
      <div className="eyebrow">YOUR ATLAS · {sum.estates.length} {sum.estates.length === 1 ? 'ESTATE' : 'ESTATES'}</div>
      <h1>{sum.headline}</h1>
      <p className="lede">
        {sum.first ? (
          <>
            <span className="hl">{sum.subject}</span> {sum.quiet}.{' '}
            {sum.redeploying ? (
              <>A <u>redeploy</u> is already on its way; everything else is in bloom.</>
            ) : redeploy ? (
              <>A <button className="uline" onClick={() => engine.deploy(redeploy.id)}>redeploy</button> might help; everything else is in bloom.</>
            ) : (
              <>Everything else is in bloom.</>
            )}
          </>
        ) : (
          <>Every estate answered its last check. {Object.keys(st.flows).length ? 'A deploy is on its way.' : 'Everything is in bloom.'}</>
        )}
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => engine.checkAll()}>Check everything</button>
        <button className="btn ghost" onClick={() => plantEstate().then((id) => id && say(`Planted ${id}.`))}>Plant a project →</button>
      </div>
      <nav aria-label="Estates" className="estates">
        <div className="mono-label">ESTATES</div>
        {sum.estates.map((e) => (
          <button key={e.id} className="estate" onClick={() => fly(e.id)}>
            <EstateThumb id={e.id} />
            <span className="name">{e.label}</span>
            <span className="dots" role="img" aria-label={e.text}>
              {e.statuses.map((s, i) => <Dot key={i} status={s} size={9} />)}
            </span>
            <span className={`state ${e.tone}`}>{e.text}</span>
          </button>
        ))}
        <div className="more">
          <button onClick={() => onPanel('inventory')}>All services →</button>
          <button onClick={() => onPanel('links')}>All links →</button>
        </div>
      </nav>
    </section>
    <button className="hero-handle" onClick={onToggle} aria-label="Hide the menu" aria-expanded={!collapsed} aria-keyshortcuts="[" title="Hide the menu ([)" inert={collapsed}>{chev(true)}</button>
    {collapsed && <HeroTab onToggle={onToggle} />}
    </>
  )
}

// Mini map thumbnail: the estate's real plot outline, one status dot per service at its real spot.
const THUMB = 34, DOT = 2.25
function thumbGeometry(e: Estate) {
  const [x0, y0, x1, y1] = e.poly.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity])
  const k = (THUMB - 2 * DOT - 2) / Math.max(x1 - x0, y1 - y0), ox = THUMB / 2 - ((x0 + x1) / 2) * k, oy = THUMB / 2 - ((y0 + y1) / 2) * k
  const dots = e.buildings.map((b) => ({ id: b.id, x: b.x * k + ox, y: b.y * k + oy }))
  for (let it = 0; it < 30; it++) for (const a of dots) for (const b of dots) { // push overlapping dots apart
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy)
    if (a === b || d >= 2 * DOT + 0.6) continue
    const m = ((2 * DOT + 0.6 - d) / 2) / (d || 1), ux = d ? dx : 1, uy = d ? dy : 0
    a.x += ux * m; a.y += uy * m; b.x -= ux * m; b.y -= uy * m
  }
  return { t: `translate(${ox} ${oy}) scale(${k})`, dots }
}

function EstateThumb({ id }: { id: string }) {
  const e = estateOf(id)
  const g = useMemo(() => (e ? thumbGeometry(e) : null), [e]) // changes only with the world release
  const st = useEngine((s) => s)
  if (!e || !g) return null
  return (
    <svg width={THUMB} height={THUMB} viewBox={`0 0 ${THUMB} ${THUMB}`} aria-hidden="true">
      <path d={e.d} fill={e.base} transform={g.t} />
      {g.dots.map((d) => <circle key={d.id} cx={d.x} cy={d.y} r={DOT} fill={colorOf(st.nodes[d.id]?.status ?? 'unknown')} stroke="#fff" strokeOpacity=".7" strokeWidth=".6" />)}
    </svg>
  )
}
