import { useSyncExternalStore } from 'react'
import { edges, hasChecks, mockHistory, nodeById, nodes } from './data'
import type { EngineState, MockNode, NodeState, Status } from './types'

// Tiny stand-in for the server's SSE stream: an immutable state snapshot plus random timers.
// The first snapshot is the design's scene: goldcrisp's site is down and a redeploy is on its way.
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
const sites = () => nodes.filter((n) => n.type === 'site')
const deployEdges = () => edges.filter((e) => e.type === 'deploy')
const webhookEdges = () => edges.filter((e) => e.type === 'webhook')
const SCENE_EDGE = 'goldcrisp-repo>goldcrisp-site' // the design's scene: goldcrisp's site is down, a redeploy is on its way
const MIN = 60_000

function nodeState(n: MockNode, now: number): NodeState {
  const history = mockHistory(n)
  return {
    status: n.initialStatus,
    lastChecked: now - 4 * MIN,
    since: n.initialStatus === 'down' ? now - 12 * MIN : now - 3 * 3600_000,
    responseMs: hasChecks(n) && n.initialStatus !== 'down' ? history[history.length - 1] : null,
    history,
  }
}

class Engine {
  private state: EngineState = { nodes: {}, edges: {}, flows: {}, updatedAt: Date.now() }
  private seeded = false
  private subs = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private running = false
  private prev = new Map<string, { from: Status; to: Status }>() // statuses to restore when a deploy ends

  getState = () => this.state

  // Called whenever the config changes: new nodes/edges get a fresh state, existing ones keep theirs.
  sync() {
    const now = Date.now()
    const ns = { ...this.state.nodes }
    for (const n of nodes) ns[n.id] ??= nodeState(n, now)
    const es = { ...this.state.edges }
    for (const e of edges) es[e.id] ??= { lastResult: 'ok' as const }
    const flows = { ...this.state.flows }
    if (!this.seeded && edges.some((e) => e.id === SCENE_EDGE)) flows[SCENE_EDGE] = 'deploy'
    this.seeded = true
    this.set({ nodes: ns, edges: es, flows })
  }
  subscribe = (fn: () => void) => {
    this.subs.add(fn)
    return () => void this.subs.delete(fn)
  }

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch, updatedAt: Date.now() }
    this.subs.forEach((s) => s())
  }
  private patchNode(id: string, patch: Partial<NodeState>) {
    const cur = this.state.nodes[id]
    if (patch.status && patch.status !== cur.status) patch.since = Date.now()
    this.set({ nodes: { ...this.state.nodes, [id]: { ...cur, ...patch } } })
  }
  private setFlow(edgeId: string, kind: 'deploy' | 'webhook' | null) {
    const flows = { ...this.state.flows }
    if (kind) flows[edgeId] = kind
    else delete flows[edgeId]
    this.set({ flows })
  }
  // In-flight results always land (so StrictMode's stop/start can't strand a deploy as 'working').
  private later(ms: number, fn: () => void) {
    setTimeout(fn, ms)
  }
  private loop(minS: number, maxS: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      if (!this.running) return
      fn()
      this.loop(minS, maxS, fn)
    }, rnd(minS, maxS) * 1000)
    this.timers.add(t)
  }

  // `still` freezes the scene (no timers at all), used for screenshots.
  start(still = false) {
    if (this.running || still) return
    this.running = true
    if (this.state.flows[SCENE_EDGE]) {
      this.prev.set(SCENE_EDGE, { from: 'ok', to: 'down' })
      this.later(45_000, () => this.finishDeploy(SCENE_EDGE))
    }
    const each = <T,>(xs: () => T[], fn: (x: T) => void) => () => xs().length && fn(pick(xs()))
    this.loop(8, 14, each(sites, (n) => this.check(n.id)))
    this.loop(35, 60, each(deployEdges, (e) => this.deploy(e.id)))
    this.loop(25, 45, each(webhookEdges, (e) => this.webhook(e.id)))
    this.loop(70, 100, () => this.breakSite())
  }
  stop() {
    this.running = false
    this.timers.forEach(clearTimeout)
    this.timers.clear()
  }

  // The result lands ~1 s after the ping.
  check(nodeId: string, forceOk = false) {
    this.later(900, () => {
      const cur = this.state.nodes[nodeId]
      const def = nodeById(nodeId)!
      if (cur.status === 'down') return this.patchNode(nodeId, { lastChecked: Date.now(), responseMs: null })
      const failed = !forceOk && hasChecks(def) && Math.random() < 0.06
      const ms = Math.round(def.baseMs * rnd(0.7, 1.5)) || 1
      const status: Status = cur.status === 'working' || cur.status === 'paused' ? cur.status : failed ? 'degraded' : 'ok'
      this.patchNode(nodeId, {
        status,
        lastChecked: Date.now(),
        responseMs: hasChecks(def) && !failed ? ms : null,
        history: hasChecks(def) ? [...cur.history.slice(1), failed ? 0 : ms] : cur.history,
      })
    })
  }

  checkAll() {
    nodes.forEach((n) => this.check(n.id))
  }

  deploy(edgeId: string) {
    const edge = edges.find((e) => e.id === edgeId)
    if (!edge || this.state.flows[edgeId] === 'deploy') return
    const prev = { from: this.state.nodes[edge.from].status, to: this.state.nodes[edge.to].status }
    this.prev.set(edgeId, prev)
    if (prev.from !== 'down') this.patchNode(edge.from, { status: 'working' })
    if (prev.to !== 'down') this.patchNode(edge.to, { status: 'working' })
    this.setFlow(edgeId, 'deploy')
    this.later(rnd(6, 12) * 1000, () => this.finishDeploy(edgeId))
  }

  private finishDeploy(edgeId: string) {
    const edge = edges.find((e) => e.id === edgeId)!
    const prev = this.prev.get(edgeId)
    if (this.state.flows[edgeId] !== 'deploy' || !prev) return
    const result = Math.random() < 0.85 ? 'ok' : 'failed'
    const cleaned = (s: Status) => (s === 'working' || s === 'degraded' ? 'ok' : s)
    this.set({ edges: { ...this.state.edges, [edgeId]: { lastResult: result } } })
    this.setFlow(edgeId, null)
    if (this.state.nodes[edge.from].status === 'working') this.patchNode(edge.from, { status: cleaned(prev.from) })
    const to = this.state.nodes[edge.to].status
    if (to === 'working' || (to === 'down' && result === 'ok')) this.patchNode(edge.to, { status: result === 'ok' ? 'ok' : cleaned(prev.to) })
    if (result === 'ok') this.check(edge.to, true)
  }

  webhook(edgeId: string) {
    if (this.state.flows[edgeId]) return
    this.setFlow(edgeId, 'webhook')
    this.later(1800, () => {
      this.setFlow(edgeId, null)
      this.set({ edges: { ...this.state.edges, [edgeId]: { lastResult: Math.random() < 0.92 ? 'ok' : 'failed' } } })
    })
  }

  breakSite() {
    const up = sites().filter((s) => this.state.nodes[s.id].status === 'ok')
    if (!up.length) return
    const s = pick(up)
    this.patchNode(s.id, { status: 'down', responseMs: null })
    this.later(25_000, () => {
      if (this.state.nodes[s.id].status === 'down') {
        this.patchNode(s.id, { status: 'ok' })
        this.check(s.id, true)
      }
    })
  }

  fixAll() {
    for (const n of nodes) {
      const st = this.state.nodes[n.id].status
      if (st === 'down' || st === 'degraded') this.patchNode(n.id, { status: 'ok', lastChecked: Date.now(), responseMs: n.baseMs || null })
    }
  }
}

export const engine = new Engine()

export function useEngine<T>(select: (s: EngineState) => T): T {
  return useSyncExternalStore(engine.subscribe, () => select(engine.getState()))
}
