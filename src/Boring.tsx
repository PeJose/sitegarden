import { useState } from 'react'
import { edges, groups, nodeById, nodes } from './mock/data'
import { engine, useEngine } from './mock/engine'
import type { MockNode, Status } from './mock/types'
import type { Style } from './prefs'
import { FunSwitch } from './ui/Controls'
import { ago, useNow } from './lib/time'
import { minutesSince } from './summary'
import { plantEstate } from './world'

// Boring.dc.html: same data, no ornaments. Estates are cards in a 2-column board; nodes sit in flow order inside their card.
const COL = 490, ROW = 340
function board() {
  const pos: Record<string, [number, number]> = {}
  const boxes = groups.map((g, i) => {
    const ox = 40 + (i % 2) * COL, oy = 90 + Math.floor(i / 2) * ROW
    nodes.filter((n) => n.group === g.id).forEach((n, k) => { pos[n.id] = [ox + 14 + (k % 3) * 145, oy + 72 + (k % 2) * 130] })
    return { g, ox, oy }
  })
  const lines = Object.fromEntries(edges.filter((e) => pos[e.from] && pos[e.to]).map((e) => {
    const [x1, y1] = pos[e.from], [x2, y2] = pos[e.to]
    return [e.id, `M${x1 + 70} ${y1 + 66} V${(y1 + y2) / 2 + 33} H${x2 + 70} V${y2}`]
  }))
  return { pos, boxes, lines, height: 90 + Math.ceil(groups.length / 2) * ROW }
}
const WORD = { cms: 'Studio', repo: 'Repo', site: 'Site', job: 'Job', db: 'DB' } as const
const LABEL: Record<Status, string> = { ok: 'Healthy', working: 'Deploying', degraded: 'Slow', down: 'Down', paused: 'Paused', unknown: 'Unknown' }

function Marker({ status, size }: { status: Status; size: number }) {
  if (status === 'down') return <span style={{ width: size, height: size, background: '#DC2626', transform: 'rotate(45deg)' }} />
  if (status === 'working') return <span style={{ width: size, height: size, borderRadius: '50%', border: '2px solid #2563EB', boxSizing: 'border-box' }} />
  return <span style={{ width: size, height: size, borderRadius: '50%', background: status === 'ok' ? '#16A34A' : '#D97706' }} />
}
const textColor = (s: Status) => (s === 'down' ? '#B91C1C' : s === 'working' ? '#1D4ED8' : s === 'ok' ? '#15803D' : '#B45309')

// The design lists the estate's repo and studio links on the site card.
const boringLinks = (n: MockNode) => {
  if (n.type !== 'site') return n.links
  const mine = nodes.filter((x) => x.group === n.group)
  const pick = (t: string, re: RegExp) => (mine.find((x) => x.type === t)?.links ?? []).filter((l) => re.test(l.label))
  return [...pick('repo', /actions|settings|secrets|pull/i).map((l) => ({ ...l, label: l.label === 'Settings' ? 'Repo settings' : l.label })), ...pick('cms', /sanity manage|webhooks/i)]
}

function Side({ n }: { n: MockNode }) {
  const st = useEngine((s) => s.nodes[n.id])
  const now = useNow(15000)
  const edge = edges.find((e) => e.type === 'deploy' && nodeById(e.from)?.group === n.group)
  const tint = st.status === 'down' ? ['#FEF2F2', '#FECACA'] : st.status === 'ok' ? ['#F0FDF4', '#BBF7D0'] : ['#EFF6FF', '#BFDBFE']
  const v = st.history.slice(-13)
  const max = Math.max(...v, 1), min = Math.min(...v)
  return (
    <aside className="b-side">
      <div>
        <div className="b-up">{n.group} / {n.type}</div>
        <h2>{{ site: 'Live site', repo: 'Repository', cms: 'Content studio', job: 'Scheduled job', db: 'Database' }[n.type]}</h2>
        <div className="b-sm">{n.name} · {n.host}</div>
      </div>
      <div className="b-status" style={{ background: tint[0], borderColor: tint[1] }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: textColor(st.status) }}><Marker status={st.status} size={10} />{LABEL[st.status]}</span>
        <span className="b-sm" style={{ color: '#374151' }}>{st.status === 'down' ? `down ${minutesSince(st.since, now)} min` : `${st.responseMs ? `200 · ${st.responseMs} ms · ` : ''}${ago(st.lastChecked, now)}`}</span>
      </div>
      {n.checks.length > 0 && (
        <div>
          <div className="b-h">Health check</div>
          <div className="b-grid"><span>Interval</span><b>5 min</b><span>Request</span><b>GET, expect 200</b><span>Keyword</span><b>“{n.name.replace(/\W.*/, '')}”</b><span>Timeout</span><b>10 s</b></div>
          <svg width="100%" height="48" viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true" style={{ marginTop: 10 }}>
            <polyline points={v.map((y, i) => `${i * 25},${40 - ((y - min) / (max - min || 1)) * 22}`).join(' ')} fill="none" stroke="#2563EB" strokeWidth="1.5" /><path d="M0 46 H300" stroke="#E5E7EB" />
          </svg>
          <div className="b-sm">Response time, last 24 h</div>
        </div>
      )}
      <div>
        <div className="b-h">Links</div>
        <div className="b-links">{boringLinks(n).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</div>
      </div>
      <div className="b-actions">
        <button className="p" disabled={st.status === 'working' || !edge} onClick={() => edge && engine.deploy(edge.id)}>Deploy</button>
        <button onClick={() => engine.check(n.id)}>Refresh</button>
      </div>
    </aside>
  )
}

export function Boring({ setStyle }: { setStyle: (s: Style) => void }) {
  const [sel, setSel] = useState(new URLSearchParams(location.search).get('select') ?? nodes[0].id)
  const bd = board()
  const st = useEngine((s) => s)
  const now = useNow(15000)
  const mins = minutesSince(Math.max(...nodes.map((n) => st.nodes[n.id].lastChecked)), now)
  const [tapped, setTapped] = useState(false)
  return (
    <div className="b-app">
      <header>
        <b className="b-logo">sitegarden</b>
        <span className="b-sm">{groups.length} projects · {nodes.length} services</span>
        <span style={{ flex: 1 }} />
        <span className="b-sm">Updated {mins < 1 ? 'just now' : `${mins} min ago`}</span>
        <button className="b-btn" onClick={() => engine.checkAll()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
          Refresh all
        </button>
        <div className={`b-theme ${tapped ? 'open' : ''}`}>
          <FunSwitch style="boring" setStyle={setStyle} />
          <button className="b-sq" aria-label="Theme: light, boring mode. Hover for fun mode" onClick={() => { setTapped(true); setTimeout(() => setTapped(false), 3500) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
          </button>
        </div>
      </header>
      <div className="b-main">
        <div className="b-board"><div className="b-stage" style={{ height: bd.height }}>
          <svg width="1000" height={bd.height} viewBox={`0 0 1000 ${bd.height}`} aria-hidden="true">
            {bd.boxes.map(({ g, ox, oy }) => <rect key={g.id} x={ox} y={oy} width={COL - 40} height={ROW - 24} rx="12" fill="#fff" stroke="#E5E7EB" />)}
            <g fill="none" stroke="#9CA3AF" strokeWidth="1.5">{Object.values(bd.lines).map((d) => <path key={d} d={d} />)}</g>
            {edges.filter((e) => st.flows[e.id] && bd.lines[e.id]).map((e) => <path key={e.id} className="ink" d={bd.lines[e.id]} fill="none" stroke="#2563EB" strokeWidth="2" strokeDasharray="5 5" />)}
          </svg>
          {bd.boxes.map(({ g, ox, oy }) => <div key={g.id} className="b-proj" style={{ left: ox + 20, top: oy + 16 }}>{g.label}</div>)}
          {nodes.map((n) => {
            const s = st.nodes[n.id]?.status ?? 'unknown'
            return (
              <button key={n.id} className={`b-node ${sel === n.id ? 'sel' : ''} ${s === 'down' ? 'down' : ''}`} style={{ left: bd.pos[n.id][0], top: bd.pos[n.id][1] }} onClick={() => setSel(n.id)}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{WORD[n.type]}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: textColor(s) }}><Marker status={s} size={8} />{LABEL[s]}</span>
              </button>
            )
          })}
          <button className="b-add" style={{ top: bd.height - 56 }} onClick={() => void plantEstate()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add project</button>
        </div></div>
        {nodeById(sel) && <Side key={sel} n={nodeById(sel)!} />}
      </div>
    </div>
  )
}
