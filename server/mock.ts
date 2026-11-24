import { pick, rngFor, type Rng } from '../src/gen/rng'
import type { ConfigEdge, ConfigEstate, ConfigNode } from '../src/gen/types'

const NAMES = ['hazelnut', 'marigold', 'thistle', 'larkspur', 'quince', 'bramble', 'tansy', 'fennel', 'juniper', 'sorrel', 'yarrow', 'clover', 'heather', 'mulberry', 'sedum']
const TYPES = ['cms', 'repo', 'site', 'job', 'db']
const RANK: Record<string, number> = { cms: 0, repo: 1, job: 1, db: 2, site: 3 }
const HOST: Record<string, string> = { cms: 'Sanity', repo: 'GitHub', site: 'FTPS', job: 'cron', db: 'Postgres' }
const NOTE: Record<string, string> = { cms: 'Content studio.', repo: 'Deploy workflow runs on main.', site: 'Public site, checked every 5 minutes.', job: 'Nightly job, pings a heartbeat.', db: 'Primary database.' }
const EDGE: Record<string, [string, string]> = { cms: ['webhook', 'WEBHOOK'], db: ['sync', 'SYNC'] }

function node(estate: string, type: string, i: number): ConfigNode {
  const id = `${estate}-${type}${i ? i + 1 : ''}`
  const links = type === 'repo' ? [{ label: 'Actions', url: `https://github.com/PeJose/${estate}/actions` }, { label: 'Secrets', url: `https://github.com/PeJose/${estate}/settings/secrets/actions` }]
    : type === 'site' ? [{ label: `${estate}.example`, url: `https://${estate}.example` }, { label: 'Hosting panel', url: 'https://panel.example-host.com' }]
    : [{ label: type === 'cms' ? 'Sanity manage' : 'Dashboard', url: `https://example.com/${estate}/${type}` }]
  return { id, type, name: id, host: HOST[type], links, notes: NOTE[type], checks: type === 'site' ? ['http every 5m, expect 200', 'ssl warn 14d'] : [], baseMs: type === 'site' ? 150 + Math.round(Math.random() * 250) : 0, initialStatus: 'ok' }
}

// A random estate with 1-6 nodes of mixed types, wired in data-flow order (studio -> repo -> site).
export function makeEstate(r: Rng, taken: string[]): ConfigEstate {
  const free = NAMES.filter((n) => !taken.includes(n))
  const id = free.length ? pick(r, free) : `estate${taken.length + 1}`
  const count = 1 + Math.floor(r() * 6)
  const types = Array.from({ length: count }, () => pick(r, TYPES)).sort((a, b) => RANK[a] - RANK[b])
  const seen: Record<string, number> = {}
  const nodes = types.map((t) => node(id, t, seen[t] = (seen[t] ?? -1) + 1))
  const edges: ConfigEdge[] = nodes.slice(1).map((n, i) => {
    const from = nodes[i]
    const [type, label] = EDGE[from.type] ?? ['deploy', pick(r, ['FTPS', 'SSH', 'RSYNC'])]
    return { from: from.id, to: n.id, type, label }
  })
  return { id, label: id, nodes, edges }
}

// Deterministic extras for the ?estates=N screenshot helper.
export function syntheticEstates(base: string[], n: number): ConfigEstate[] {
  const out: ConfigEstate[] = []
  for (let i = 0; i < n; i++) out.push(makeEstate(rngFor('synthetic', i), [...base, ...out.map((e) => e.id)]))
  return out
}
