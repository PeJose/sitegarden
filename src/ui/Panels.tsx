import { groups, nodes } from '../mock/data'
import { useEngine } from '../mock/engine'
import { ago, useNow } from '../lib/time'
import { Dot } from './Dots'

const WORD = { cms: 'Studio', repo: 'Repository', site: 'Site', job: 'Job', db: 'Database' } as const
const STATE = { ok: 'Healthy', working: 'Deploying', degraded: 'Slow', down: 'Down', paused: 'Paused', unknown: 'Unknown' } as const

// Inventory and Links: not in the design, so they borrow its card language (paper card, Fraunces title, mono eyebrows).
export function Panel({ kind, onClose, onPick }: { kind: 'inventory' | 'links'; onClose: () => void; onPick: (id: string) => void }) {
  const st = useEngine((s) => s.nodes)
  const now = useNow(15000)
  return (
    <section className="sheet" aria-label={kind === 'inventory' ? 'All services' : 'All links'}>
      <button className="x" onClick={onClose} aria-label="Close (Esc)">×</button>
      <div className="mono-label accent">{kind === 'inventory' ? 'INVENTORY' : 'LINKS'}</div>
      <h2>{kind === 'inventory' ? 'All services' : 'All links'}</h2>
      {groups.map((g) => (
        <div key={g.id} className="group">
          <div className="mono-label">{g.label.toUpperCase()}</div>
          {kind === 'inventory'
            ? nodes.filter((n) => n.group === g.id).map((n) => (
                <button key={n.id} className="irow" onClick={() => onPick(n.id)}>
                  <Dot status={st[n.id].status} size={10} radius={3} />
                  <b>{n.name}</b>
                  <span className="muted">{WORD[n.type]} · {n.host}</span>
                  <span className="grow" />
                  <span className="muted">{STATE[st[n.id].status]} · {ago(st[n.id].lastChecked, now)}</span>
                </button>
              ))
            : nodes.filter((n) => n.group === g.id).flatMap((n) => n.links.map((l) => (
                <a key={l.url} className="irow" href={l.url} target="_blank" rel="noreferrer">
                  <b>{l.label}</b>
                  <span className="muted">{n.name}</span>
                  <span className="grow" />
                  <span className="muted mono">{l.url.replace('https://', '')} ↗</span>
                </a>
              )))}
        </div>
      ))}
    </section>
  )
}
