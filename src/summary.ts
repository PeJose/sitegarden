import { groups, nodes } from './mock/data'
import type { EngineState, NodeState, Status } from './mock/types'

// Everything the hero panel and status strip say, derived from the engine state.
export const isBad = (s: Status) => s === 'down' || s === 'degraded'
export const minutesSince = (ts: number, now: number) => Math.floor((now - ts) / 60_000)

export function summarize(st: EngineState, now: number) {
  const bad = nodes.filter((n) => isBad(st.nodes[n.id].status))
  const well = nodes.length - bad.length
  const flowing = (g: string) => Object.keys(st.flows).some((e) => e.startsWith(g + '-'))
  const first = bad[0]
  const typeWord = { cms: 'studio', repo: 'repo', site: 'site', job: 'job', db: 'database' } as const
  const mins = first ? minutesSince(st.nodes[first.id].since, now) : 0
  const lastChecked = Math.max(...nodes.map((n) => st.nodes[n.id].lastChecked))
  const checked = minutesSince(lastChecked, now)
  return {
    headline: bad.length ? `${well} of ${nodes.length} growing well` : `All ${nodes.length} growing well`,
    bad,
    first,
    subject: first ? `${first.group}’s ${typeWord[first.type]}${bad.length > 1 ? ` and ${bad.length - 1} more` : ''}` : '',
    quiet: first ? (mins < 1 ? 'just went quiet' : `went quiet ${mins} minute${mins === 1 ? '' : 's'} ago`) : '',
    redeploying: first ? flowing(first.group) : false,
    checkedText: !lastChecked ? 'not checked yet' : checked < 1 ? 'checked just now' : `checked ${checked} min ago`,
    estates: groups.map((g) => {
      const ns = nodes.filter((n) => n.group === g.id)
      const statuses = ns.map((n) => st.nodes[n.id].status)
      const down = statuses.filter((s) => s === 'down').length
      const slow = statuses.filter((s) => s === 'degraded').length
      return {
        ...g,
        statuses,
        hasDown: down > 0,
        text: down ? `${down} down` : slow ? `${slow} slow` : statuses.includes('working') ? 'deploying' : 'all well',
        tone: down || slow ? 'bad' : statuses.includes('working') ? 'warn' : 'ok',
      }
    }),
  }
}

// Short reason shown next to a problem node.
export function reasonOf(n: NodeState, now: number): string {
  const mins = minutesSince(n.since, now)
  if (n.status === 'down') return `down ${mins < 1 ? '<1' : mins} min · timeout 10 s`
  if (n.status === 'working') return `deploying ${mins < 1 ? '<1' : mins} min`
  return `slow · ${n.responseMs ? `p95 ${(n.responseMs / 1000).toFixed(1)} s` : 'no answer'}`
}
