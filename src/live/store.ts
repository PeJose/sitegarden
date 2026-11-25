import { useSyncExternalStore } from 'react'
import { edges, nodeById, nodes } from '../mock/data'
import type { EngineState, NodeState } from '../mock/types'

export const still = typeof location !== 'undefined' && new URLSearchParams(location.search).has('still') // screenshots: snapshot only, no events
export interface Snapshot { lastEventId: number; demo: boolean; nodes: Record<string, Omit<NodeState, 'lastChecked' | 'since'> & { lastChecked: number | null; since: number | null }> }

// Every status comes from the server: /api/status once, then the SSE events. The demo overlay (`working`) is the only thing the client adds.
class Live {
  private state: EngineState = { nodes: {}, edges: {}, flows: {}, demo: false, updatedAt: Date.now() }
  private server: Record<string, NodeState> = {}
  private working = new Set<string>()
  private lastId = 0
  private early: [string, Parameters<Live['apply']>[1], number][] | null = [] // events that beat the first snapshot; replayed by id
  private subs = new Set<() => void>()
  say?: (m: string) => void // the toast; set by the fun view (shortcut: the plain view shows none, when it gets a toast)

  getState = () => this.state
  subscribe = (fn: () => void) => (this.subs.add(fn), () => void this.subs.delete(fn))

  // Nodes the server does not know (config changed before the reload) render as unknown.
  load(snap: Snapshot | null) {
    const now = Date.now()
    this.lastId = snap?.lastEventId ?? 0
    this.server = Object.fromEntries(nodes.map((n) => {
      const s = snap?.nodes[n.id]
      return [n.id, s ? { ...s, lastChecked: s.lastChecked ?? 0, since: s.since ?? now } : { status: 'unknown', lastChecked: 0, since: now, responseMs: null, history: [] }]
    }))
    const early = this.early
    this.early = null
    this.set({ demo: snap?.demo ?? false, edges: Object.fromEntries(edges.map((e) => [e.id, this.state.edges[e.id] ?? { lastResult: 'ok' as const }])) })
    early?.forEach((x) => this.apply(...x))
  }
  snapshot = async (): Promise<Snapshot | null> => {
    try { const r = await fetch('/api/status'); return r.ok ? await r.json() : null } catch { return null }
  }

  apply(type: string, e: { node: string; status: NodeState['status']; ms?: number }, id: number) {
    if (this.early) return void this.early.push([type, e, id])
    const cur = this.server[e.node]
    if (still || !cur || id <= this.lastId) return
    if (id > this.lastId) this.lastId = id
    const now = Date.now()
    let next: NodeState
    if (type === 'node.status') next = { ...cur, status: e.status, since: now }
    else if (type === 'check.result') {
      const ok = e.status === 'ok', hist = ok && e.ms == null ? cur.history : [...cur.history, ok ? e.ms! : 0].slice(-48) // an ok result without a time adds no point
      next = { ...cur, lastChecked: now, responseMs: ok ? e.ms ?? cur.responseMs : null, history: hist }
    } else return
    this.server = { ...this.server, [e.node]: next }
    this.set({})
  }

  // Results arrive over SSE; no optimistic change. `queued` 0 means no check matched.
  private async refresh(node?: string) {
    try {
      const r = await fetch('/api/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(node ? { node } : {}) })
      const { queued } = await r.json()
      if (queued === 0) this.say?.(node ? `No checks on ${nodeById(node)?.name ?? node}` : 'Nothing to check')
    } catch { this.say?.('Could not reach the server') }
  }
  check = (id: string) => this.refresh(id)
  checkAll = () => this.refresh()

  // For the demo flows: they write flows, edge results and the working overlay, never the server's fields.
  set(patch: Partial<EngineState>) {
    const nodes = this.working.size ? Object.fromEntries(Object.entries(this.server).map(([id, n]) => [id, this.working.has(id) ? { ...n, status: 'working' as const } : n])) : this.server
    this.state = { ...this.state, ...patch, nodes, updatedAt: Date.now() }
    this.subs.forEach((s) => s())
  }
  setWorking(ids: string[], on: boolean) {
    ids.forEach((i) => (on ? this.working.add(i) : this.working.delete(i)))
    this.set({})
  }
  serverStatus = (id: string) => this.server[id]?.status
}

export const live = new Live()

export function useEngine<T>(select: (s: EngineState) => T): T {
  return useSyncExternalStore(live.subscribe, () => select(live.getState()))
}
