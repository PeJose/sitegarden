import { edges, nodeById, nodes } from '../mock/data'
import { live, useEngine } from '../live/store'
import { NO_DEPLOY, deploy } from '../live/demo'
import type { LinkItem, MockNode, Status } from '../mock/types'
import { minutesSince } from '../summary'
import { useNow } from '../lib/time'
import { Dot, COLOR } from './Dots'

const TYPE = { cms: 'STUDIO', repo: 'REPO', site: 'SITE', job: 'JOB', db: 'DATABASE' } as const
const TITLE = { cms: 'The content studio', repo: 'The repository', site: 'The live site', job: 'The scheduled job', db: 'The database' } as const

// The design's card for a site shows cross-service links (Actions, Secrets, Sanity, host); others show their own.
export function popLinks(n: MockNode): { label: string; url: string }[] {
  if (n.type !== 'site') return n.links.slice(0, 4)
  const mine = (t: string) => nodes.find((x) => x.group === n.group && x.type === t)?.links ?? []
  const find = (ls: LinkItem[], re: RegExp) => ls.find((l) => re.test(l.label))
  const host = n.links[1]
  const edge = edges.find((e) => e.to === n.id)
  const sanity = find(mine('cms'), /sanity/i)
  return [find(mine('repo'), /actions/i), find(mine('repo'), /secrets/i), sanity && { ...sanity, label: 'Sanity' }, host && { ...host, label: `${edge?.label ?? 'Host'} host` }].filter(Boolean) as LinkItem[]
}

const BLOCK: Record<string, { bg: string; fg: string }> = {
  ok: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
  warn: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
  down: { bg: 'var(--down-bg)', fg: 'var(--down-text)' },
  idle: { bg: 'var(--chip)', fg: 'var(--muted)' },
}
const BAR = { ok: COLOR.ok, warn: COLOR.warn, down: COLOR.down, idle: COLOR.idle }

function describe(status: Status, ms: number | null, since: number, now: number) {
  const mins = minutesSince(since, now)
  switch (status) {
    case 'down': return { tone: 'down', title: mins < 1 ? 'Just went down' : `Down for ${mins} min`, side: 'timeout 10 s' }
    case 'working': return { tone: 'warn', title: 'Deploying', side: 'in progress' }
    case 'degraded': return { tone: 'warn', title: 'Slow', side: ms ? `${ms} ms` : 'no answer' }
    case 'paused': return { tone: 'idle', title: 'Paused', side: '' }
    case 'unknown': return { tone: 'idle', title: 'Not checked yet', side: '' }
    default: return { tone: 'ok', title: 'Healthy', side: ms ? `200 · ${ms} ms` : 'answering' }
  }
}

function Spark({ values, down }: { values: number[]; down: boolean }) {
  const v = values.slice(-24)
  const good = v.filter((x) => x > 0)
  const max = Math.max(...good, 1), min = Math.min(...good, 0)
  const w = down ? 214 : 260
  const pts = v.map((x, i) => `${((i / Math.max(v.length - 1, 1)) * w).toFixed(1)} ${(36 - ((x || min) - min) / (max - min || 1) * 14).toFixed(1)}`)
  return (
    <svg width="100%" height="44" viewBox="0 0 260 44" preserveAspectRatio="none" aria-hidden="true">
      {pts.length > 0 && <path d={'M' + pts.join(' L')} fill="none" stroke={COLOR.ok} strokeWidth="1.8" />}
      {down && <path d="M214 30 C222 22 228 8 236 4 H260" fill="none" stroke={COLOR.down} strokeWidth="1.8" />}
      <path d="M0 42H260" stroke="var(--hair)" />
    </svg>
  )
}

// x/y: the pin's position inside the map box. The card flips below the pin near the top and is clamped to the box.
export function Popover({ nodeId, x, y, boxW }: { nodeId: string; x: number; y: number; boxW: number }) {
  const below = y < 430
  const style = { '--x': Math.min(Math.max(x, 147), Math.max(147, boxW - 147)), '--y': y } as React.CSSProperties
  const arrow = { '--x': x, '--y': y } as React.CSSProperties
  const n = nodeById(nodeId)!
  const st = useEngine((s) => s.nodes[nodeId])
  const demo = useEngine((s) => s.demo)
  const now = useNow(15000)
  const edge = edges.find((e) => e.type === 'deploy' && (e.from === nodeId || e.to === nodeId)) ?? edges.find((e) => e.type === 'deploy' && nodeById(e.from)?.group === n.group)
  const d = describe(st.status, st.responseMs, st.since, now)
  const links = popLinks(n)
  const shape = st.status === 'down' ? 'diamond' : st.status === 'working' || st.status === 'degraded' ? 'square' : 'circle'
  return (
    <>
      <div className={`pop-arrow ${below ? 'below' : ''}`} style={arrow} />
      <aside className={`pop ${below ? 'below' : ''}`} style={style} aria-label={`${n.name} details`}>
        <div className="bar" style={{ background: BAR[d.tone as keyof typeof BAR] }} />
        <div className="body">
          <div>
            <div className="mono-label accent">{n.group.toUpperCase()} · {TYPE[n.type]}</div>
            <div className="title">{TITLE[n.type]}</div>
            <div className="sub">{n.name} · {n.host}</div>
          </div>
          <div className="status-block" style={{ background: BLOCK[d.tone].bg }}>
            <Dot status={st.status} size={11} radius={shape === 'square' ? 3 : 2} />
            <span style={{ color: BLOCK[d.tone].fg, fontSize: 15, fontWeight: 600 }}>{d.title}</span>
            <span className="side">{d.side}</span>
          </div>
          {st.history.length > 0 && ( // real nodes have no mock.checks; any node with results gets the sparkline
            <div>
              <Spark values={st.history} down={st.status === 'down'} />
              <div className="cap">Response time, last 24 h</div>
            </div>
          )}
          <div className="links">
            {links.map((l) => <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
          </div>
          <div className="row">
            <button className="btn primary" disabled={st.status === 'working' || !edge || !demo} title={demo ? undefined : NO_DEPLOY} onClick={() => edge && deploy(edge.id)}>Redeploy</button>
            <button className="btn ghost" onClick={() => live.check(nodeId)}>Check now</button>
          </div>
        </div>
      </aside>
    </>
  )
}
