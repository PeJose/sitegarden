import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { edges } from '../mock/data'
import { useFlyTo } from '../map/MapView'
import { engine } from '../mock/engine'
import { estateOf, plantEstate, removeLastEstate } from '../world'

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

// Discreet mock controls: a tiny mono tab bottom-left that opens a small row of buttons.
export function Debug() {
  const [open, setOpen] = useState(false)
  const { getZoom } = useReactFlow(), fly = useFlyTo()
  const flyTo = (id: string | null) => { const e = id && estateOf(id); if (e) fly(e.cx, e.cy, Math.min(getZoom(), 0.9)) }
  return (
    <div className="debug">
      <button className="tab" aria-expanded={open} onClick={() => setOpen(!open)}>mock {open ? '−' : '+'}</button>
      {open && (
        <div className="menu" aria-label="Mock engine controls">
          <button onClick={() => { const free = edges.filter((e) => e.type === 'deploy' && !engine.getState().flows[e.id]); if (free.length) engine.deploy(pick(free).id) }}>deploy now</button>
          <button onClick={() => { const w = edges.filter((e) => e.type === 'webhook'); if (w.length) engine.webhook(pick(w).id) }}>webhook now</button>
          <button onClick={() => engine.breakSite()}>break a site</button>
          <button onClick={() => engine.fixAll()}>fix all</button>
          <button onClick={() => plantEstate().then(flyTo)}>plant an estate</button>
          <button onClick={() => removeLastEstate()}>remove last estate</button>
        </div>
      )}
    </div>
  )
}
