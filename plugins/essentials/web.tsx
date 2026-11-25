import { defineWebPlugin, useNodes, useStatuses } from '@sitegarden/web-sdk'

// Same card language as the host's Inventory and Links sheets (classes from the host's CSS); only the web SDK is imported.
const ago = (at: number) => { const s = Math.max(0, Math.round((Date.now() - at) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago` }

function ChecksPanel({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const st = useStatuses()
  const nodes = useNodes().filter((n) => (st[n.id]?.checks.length ?? 0) > 0)
  const groups = [...new Set(nodes.map((n) => n.group))]
  return (
    <section className="sheet" aria-label="Checks">
      <button className="x" onClick={onClose} aria-label="Close (Esc)">×</button>
      <div className="mono-label accent">CHECKS</div>
      <h2>Checks</h2>
      {!nodes.length && <p className="muted">No checks configured</p>}
      {groups.map((g) => (
        <div key={g} className="group">
          <div className="mono-label">{g.toUpperCase()}</div>
          {nodes.filter((n) => n.group === g).flatMap((n) => st[n.id].checks.map((c) => (
            <button key={`${n.id}/${c.id}`} className="irow" onClick={() => onPick(n.id)}>
              <b>{n.name}</b>
              <span className="muted">{c.id}</span>
              <span className="grow" />
              <span className="muted">{c.status}{c.detail ? ` · ${c.detail}` : ''}{c.ms != null ? ` · ${c.ms} ms` : ''} · {ago(c.at)}</span>
            </button>
          )))}
        </div>
      ))}
    </section>
  )
}

export default defineWebPlugin({
  id: 'essentials',
  register: (ctx) => ctx.add({ id: 'tab:essentials:checks', slot: 'sidepanel', input: 'tabs', order: 30, title: 'Checks', render: ({ onClose, onPick }) => <ChecksPanel onClose={onClose} onPick={onPick} /> }),
})
