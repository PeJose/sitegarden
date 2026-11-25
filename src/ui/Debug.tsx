import { useState } from 'react'
import { edges } from '../mock/data'
import { flyTo } from '../map/MapView'
import { viewport } from '../map/viewport'
import { live } from '../live/store'
import { deploy, webhook } from '../live/demo'
import { estateOf, plantEstate, removeLastEstate } from '../world'

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

// Discreet mock controls: a tiny mono tab bottom-left that opens a small row of buttons.
export function Debug() {
  const [open, setOpen] = useState(false)
  const fly = (id: string | null) => { const e = id && estateOf(id); if (e) flyTo(e.cx, e.cy, Math.min(viewport.get().zoom, 0.9)) }
  return (
    <div className="debug">
      <button className="tab" aria-expanded={open} onClick={() => setOpen(!open)}>mock {open ? '−' : '+'}</button>
      {open && (
        <div className="menu" aria-label="Mock engine controls">
          <button onClick={() => { const free = edges.filter((e) => e.type === 'deploy' && !live.getState().flows[e.id]); if (free.length) deploy(pick(free).id) }}>deploy now</button>
          <button onClick={() => { const w = edges.filter((e) => e.type === 'webhook'); if (w.length) webhook(pick(w).id) }}>webhook now</button>
          <button onClick={() => plantEstate().then(fly)}>plant an estate</button>
          <button onClick={() => removeLastEstate()}>remove last estate</button>
        </div>
      )}
    </div>
  )
}
