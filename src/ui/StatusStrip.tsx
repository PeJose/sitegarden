import { useState } from 'react'
import { groups, nodes } from '../mock/data'
import { engine, useEngine } from '../mock/engine'
import { reasonOf, summarize } from '../summary'
import { useNow } from '../lib/time'
import { Dot } from './Dots'

const PROBLEM = ['down', 'degraded', 'working']

// Only nodes that need a look get a dot; hover, focus or tap opens the list, a row flies to that node.
export function StatusStrip({ onPick }: { onPick: (id: string) => void }) {
  const st = useEngine((s) => s)
  const now = useNow(15000)
  const sum = summarize(st, now)
  const [open, setOpen] = useState(false)
  const probs = nodes.filter((n) => PROBLEM.includes(st.nodes[n.id].status))
  return (
    <div className="strip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false) }}>
      <div className="strip">
        {probs.length ? (
          <button className="dots" aria-expanded={open} aria-label={`${probs.length} need attention`} onClick={() => setOpen(!open)}>
            {probs.map((n) => <Dot key={n.id} status={st.nodes[n.id].status} size={10} radius={3} />)}
          </button>
        ) : <span className="when ok">all well ·</span>}
        <span className="when">{sum.checkedText}</span>
        <button className="round" aria-label="Refresh everything" onClick={() => engine.checkAll()}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
        </button>
      </div>
      {open && probs.length > 0 && (
        <div className="strip-card" role="menu">
          {probs.map((n) => (
            <button key={n.id} role="menuitem" className="prow" onClick={() => { setOpen(false); onPick(n.id) }}>
              <Dot status={st.nodes[n.id].status} size={10} radius={3} />
              <span className="pname"><b>{n.name}</b><span>{groups.find((g) => g.id === n.group)?.label}</span></span>
              <span className="preason">{reasonOf(st.nodes[n.id], now)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
